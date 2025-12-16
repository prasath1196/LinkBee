console.log("LinkBee: Content script loaded");
const CONFIG = {
    // Containers
    FULL_PAGE_CONTAINER: ".msg-s-message-list-content",
    OVERLAY_CONTAINER: ".msg-overlay-conversation-bubble__content-wrapper",
    SIDEBAR_LIST_ITEM: ".msg-conversation-listitem",
    SELECTORS: {
        LIST_ITEM: "li", // Chat rows are usually LIs
        DATE_HEADER: ".msg-s-message-list__time-heading",
        MESSAGE_BUBBLE: ".msg-s-event-listitem",
        MESSAGE_BODY: ".msg-s-event-listitem__body",
        SENDER_NAME: ".msg-s-message-group__name",
        SENDER_LINK: ".msg-s-message-group__profile-link",
        TIMESTAMP_GROUP: ".msg-s-message-group__timestamp",
        // Sent messages often have a hidden specific timestamp
        TIMESTAMP_EXACT: ".msg-s-event-with-indicator__sending-indicator",
        IS_OTHER: ".msg-s-event-listitem--other", // Class present if sender is NOT me
        CONVERSATION_TITLE: ".msg-entity-lockup__entity-title"
    }
};

let observer = null;
let debounceTimer = null;
let isCrawling = false; // Flag to prevent observer loops during crawl

function scrapeActiveConversation(fromCrawler = false) {
    if (isCrawling && !fromCrawler) return; // Don't scrape individually if we are running a batch crawl

    // 1. Identify Context (Full Page or Overlay?)
    let container = document.querySelector(CONFIG.FULL_PAGE_CONTAINER);
    let isOverlay = false;

    if (!container) {
        // Try overlay
        const overlays = document.querySelectorAll(CONFIG.OVERLAY_CONTAINER);
        // Find the visible/active overlay
        for (const ov of overlays) {
            if (ov.offsetParent !== null) { // Check visibility
                // We need the specific list inside
                container = ov.querySelector(".msg-s-message-list-content");
                isOverlay = true;
                break;
            }
        }
    }

    if (!container) {
        console.warn("LinkBee: [SCRAPE FAIL] No chat container found. Are you on a messaging page?");
        return;
    }

    // 2. Sequential Parse
    const listItems = Array.from(container.children);
    console.log(`LinkBee: Found ${listItems.length} list items in container.`);

    const messages = [];
    let currentDateStr = "Today"; // Fallback

    listItems.forEach(item => {
        // ... (parsing logic) ...
        // A. Is it a Date Header?
        const dateHeader = item.querySelector(CONFIG.SELECTORS.DATE_HEADER);
        if (dateHeader) {
            currentDateStr = dateHeader.innerText.trim();
        }

        // B. Is it a Message?
        const msgEl = item.querySelector(CONFIG.SELECTORS.MESSAGE_BUBBLE);
        if (msgEl) {
            // Extract Text
            const body = msgEl.querySelector(CONFIG.SELECTORS.MESSAGE_BODY);
            const text = body ? body.innerText.trim() : "[Media/Attachment]";
            if (!text) return;

            // Extract Sender
            const isMe = !msgEl.classList.contains("msg-s-event-listitem--other");
            let sender = isMe ? "Me" : "Them";
            const nameEl = item.querySelector(CONFIG.SELECTORS.SENDER_NAME);
            if (nameEl) sender = nameEl.innerText.trim();

            // ... (time logic) ...
            let timestamp = Date.now();
            const exactIndicator = msgEl.querySelector(CONFIG.SELECTORS.TIMESTAMP_EXACT);
            if (exactIndicator && exactIndicator.getAttribute("title")) {
                const raw = exactIndicator.getAttribute("title").replace("Sent at ", "").trim();
                timestamp = Date.parse(raw);
            }
            if (!timestamp || isNaN(timestamp)) {
                const groupTime = item.querySelector(CONFIG.SELECTORS.TIMESTAMP_GROUP);
                const timeStr = groupTime ? groupTime.innerText.trim() : "";
                timestamp = parseRelativeDate(currentDateStr, timeStr);
            }

            messages.push({
                text,
                sender,
                isMe,
                timestamp,
                dateHeader: currentDateStr
            });
        }
    });

    if (messages.length === 0) {
        console.warn("LinkBee: [SCRAPE FAIL] No messages extracted from items.");
        return;
    }

    // 3. Metadata
    const lastMsg = messages[messages.length - 1];

    // Find Title
    let title = "Unknown";
    // Selector for title might differ in overlay vs full page
    if (isOverlay) {
        const header = container.closest(".msg-overlay-conversation-bubble")?.querySelector(".msg-overlay-bubble-header__title");
        if (header) title = header.innerText.trim();
    } else {
        const header = document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE);
        if (header) title = header.innerText.trim();
    }

    if (title === "Unknown" || title === "Me") {
        if (!lastMsg.isMe) title = lastMsg.sender;
    }

    // 4. Send to Background
    const payload = {
        type: "NEW_CONVERSATION_DATA",
        data: {
            conversationName: title,
            history: messages,
            text: lastMsg.text,
            sender: lastMsg.sender,
            isMe: lastMsg.isMe,
            timestamp: lastMsg.timestamp,
            url: window.location.href
        }
    };

    console.log(`LinkBee: [SENDING] ${messages.length} msgs from "${title}". Last: "${lastMsg.text.substring(0, 20)}..."`);

    if (chrome.runtime?.id) {
        chrome.runtime.sendMessage(payload).then(res => {
            console.log("LinkBee: [BACKGROUND_RESPONSE]", res);
        }).catch(e => {
            console.error("LinkBee: [SEND FAIL]", e);
        });
    }
}

async function syncRecentChats() {
    const sidebar = document.querySelector(".msg-conversations-container__conversations-list");
    if (!sidebar) {
        alert("LinkBee: Please open the 'Messaging' tab to sync all chats.");
        return;
    }

    isCrawling = true;
    showToast("LinkBee: Starting Sync...", 3000);

    // 0. Load Configuration
    const settings = await chrome.storage.local.get(['syncDays']);
    const syncDays = settings.syncDays || 30; // Default to 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - syncDays);
    cutoffDate.setHours(0, 0, 0, 0);

    console.log(`LinkBee: [SYNC START] Mode=Filter Loop (${syncDays} days). Cutoff: ${cutoffDate.toDateString()}`);

    // Reset sidebar to top
    sidebar.scrollTop = 0;
    await new Promise(r => setTimeout(r, 1500));

    let items = Array.from(sidebar.querySelectorAll(CONFIG.SIDEBAR_LIST_ITEM));

    // LOGGING (User Request)
    console.log(`LinkBee: [SYNC START] Found ${items.length} conversations in sidebar.`);
    items.forEach((item, idx) => {
        const namePart = item.querySelector('.msg-conversation-listitem__participant-names')?.innerText || "Unknown";
        console.log(`LinkBee: Sidebar Item [${idx}]: ${namePart.trim()}`);
    });

    // Run until we hit the cutoff date (or run out of items)
    let i = 0;
    while (true) {
        // If we've reached the end of the current DOM list, try scrolling
        if (i >= items.length) {
            console.log(`LinkBee: [SYNC] Reached end of current list (${items.length}). Scrolling to load more...`);
            const previousHeight = sidebar.scrollHeight;
            sidebar.scrollBy({ top: 800, behavior: 'smooth' });

            // Wait for LinkedIn to fetch/render
            await new Promise(r => setTimeout(r, 2000));

            // Re-fetch items from DOM
            items = Array.from(sidebar.querySelectorAll(CONFIG.SIDEBAR_LIST_ITEM));
            console.log(`LinkBee: [SYNC] Update: ${items.length} total items in DOM.`);

            // If no new items appeared, we are likely at the very end
            if (i >= items.length) {
                console.log("LinkBee: [SYNC] No new items loaded after scroll. Stopping.");
                break;
            }
        }

        const item = items[i];

        // Extract Name from Sidebar for verification
        const sidebarNameRaw = item.querySelector('.msg-conversation-listitem__participant-names')?.innerText || "";
        const sidebarName = sidebarNameRaw.trim();

        // IDENTIFY TIMESTAMP (User Request: Step 1)
        const timeEl = item.querySelector('.msg-conversation-listitem__time-stamp') ||
            item.querySelector('.msg-conversation-card__time-stamp');
        const timeStr = timeEl ? timeEl.innerText.trim() : "Unknown Time";

        // PARSE TIMESTAMP (User Request: Step 2)
        // We use an empty string for the second arg because sidebar times are single strings (e.g. "6:54 PM" or "Dec 12")
        const parsedTimestamp = parseRelativeDate(timeStr, "");
        const parsedDateObj = new Date(parsedTimestamp);

        console.log(`LinkBee: [IDENTIFIED] Chat "${sidebarName}" | Last Timestamp: "${timeStr}"`);
        console.log(`LinkBee: [PARSED] Chat "${sidebarName}" -> ${parsedDateObj.toString()} (Diff: ${((Date.now() - parsedTimestamp) / 1000 / 3600 / 24).toFixed(1)} days ago)`);

        // FILTER LOGIC (User Request: Step 3)
        // "run the loop for the following condition: parsedDate >= Today - Dateconfigured"
        if (parsedTimestamp < cutoffDate.getTime()) {
            console.log(`LinkBee: [FILTER] STOPPING. Item "${sidebarName}" (${parsedDateObj.toDateString()}) is older than ${syncDays} days.`);
            break;
        }

        // "Save" implies holding it for the next step (Filtering)
        // currentItemData.timestamp = parsedTimestamp; 

        // Highlight current item
        item.style.borderLeft = "4px solid #0a66c2";
        item.style.backgroundColor = "#e8f3ff";

        let clicked = false;
        // Scroll first with margin to avoid headers covering it
        item.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise(r => setTimeout(r, 300)); // Wait for scroll to settle

        // Click Strategy: Priority on the Link, then the Row
        const link = item.querySelector(".msg-conversation-listitem__link") || item.querySelector("a");
        const target = link || item;

        if (target) {
            // Check if already active
            if (item.classList.contains("msg-conversation-listitem--active")) {
                clicked = true;
            } else {
                // Try Native Click first
                target.click();

                // Backup: specific framework events if native fails to trigger routing
                // LinkedIn uses Ember/React, sometimes needs these
                if (!item.classList.contains("msg-conversation-listitem--active")) {
                    simulateClick(target);
                }
                clicked = true;
            }
        }

        if (clicked) {
            showToast(`LinkBee: Opening ${sidebarName || "Chat " + (i + 1)}...`);

            // 2. WAIT FOR CONTENT MATCH
            // We wait until the Chat Title roughly matches the Sidebar Name.
            // This prevents scraping the previous chat if the new one fails to load.
            let loaded = false;
            let attempts = 0;
            while (attempts < 10) { // 5 seconds max
                await new Promise(r => setTimeout(r, 500));

                const currentTitle = document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE)?.innerText?.trim();

                // Debug Log
                if (attempts % 2 === 0) {
                    console.log(`LinkBee: Waiting for load... Sidebar="${sidebarName}" Title="${currentTitle}" ActiveClass=${item.classList.contains("msg-conversation-listitem--active")}`);
                }

                // Logic: 
                // 1. If sidebar name is empty/unknown, fall back to "active" class check + validation title changed
                // 2. If sidebar name exists, Chat Title must include it (or vice versa)
                if (sidebarName && currentTitle) {
                    // Normalize for check
                    if (currentTitle.toLowerCase().includes(sidebarName.toLowerCase()) ||
                        sidebarName.toLowerCase().includes(currentTitle.toLowerCase())) {
                        loaded = true;
                        break;
                    }
                } else if (!sidebarName && item.classList.contains("msg-conversation-listitem--active")) {
                    // Fallback for "Unknown" or headerless chats
                    loaded = true;
                    break;
                }

                attempts++;
            }

            if (!loaded) {
                console.warn(`LinkBee: [WARN] Timeout waiting for title match. Sidebar="${sidebarName}" vs Title="${document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE)?.innerText}". Scraping anyway...`);
                // FALLBACK: User says UI changes, so trust the click and scrape anyway.
                scrapeActiveConversation(true);
            } else {
                // 3. Scrape
                scrapeActiveConversation(true);
            }
        }

        // Remove highlight
        item.style.borderLeft = "";
        item.style.backgroundColor = "";

        i++;
    }

    isCrawling = false;
    showToast("LinkBee: Sync Complete!", 3000);
    console.log("LinkBee: Sync Complete.");

    // Notify Background to run analysis now that data is fresh
    chrome.runtime.sendMessage({ type: "SCAN_COMPLETED" });
}

function simulateClick(element) {
    const options = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent('mousedown', options));
    element.dispatchEvent(new MouseEvent('mouseup', options));
    element.dispatchEvent(new MouseEvent('click', options));
}

// Visual Helper
function showToast(text, duration = 2000) {
    let toast = document.getElementById('linkbee-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'linkbee-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-family: sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = text;
    toast.style.opacity = '1';

    if (duration > 0) {
        setTimeout(() => {
            toast.style.opacity = '0';
        }, duration);
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function parseRelativeDate(dateStr, timeStr) {
    const now = new Date();
    let target = new Date();
    const cleanDate = dateStr.trim().toLowerCase();

    // Handle Date Part
    // Check for "Today" OR Time-only strings (e.g. "6:54 PM", "10:30 am", "15:00")
    if (cleanDate === "today" || /^\d{1,2}:\d{2}/.test(cleanDate)) {
        // target is already now
    } else if (cleanDate === "yesterday") {
        target.setDate(now.getDate() - 1);
    } else {
        // Weekdays: "Monday", "Tuesday"...
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const dayIdx = days.indexOf(cleanDate);
        if (dayIdx > -1) {
            const currentIdx = now.getDay();
            let diff = currentIdx - dayIdx;
            if (diff <= 0) diff += 7;
            target.setDate(now.getDate() - diff);
        } else {
            // Absolute Date: "Jul 8" or "Dec 12, 2023"
            let parseStr = cleanDate;
            // If no year, assume current year logic
            if (!/\d{4}/.test(cleanDate)) {
                parseStr = `${cleanDate} ${now.getFullYear()}`;
            }
            const d = Date.parse(parseStr);
            if (!isNaN(d)) {
                target = new Date(d);
                // Fix future date edge case (e.g. Scanning "Dec 31" in "Jan"):
                if (target > now) {
                    target.setFullYear(now.getFullYear() - 1);
                }
            }
        }
    }

    // Handle Time Part (Merge "10:00 AM" into the date)
    if (timeStr) {
        const mergedString = `${target.toDateString()} ${timeStr}`;
        const final = Date.parse(mergedString);
        if (!isNaN(final)) return final;
    }

    // Fallback
    return target.getTime();
}

// ============================================================================
// OBSERVERS & INIT
// ============================================================================

function init() {
    // 1. Initial Scrape if on a chat
    setTimeout(scrapeActiveConversation, 2000);

    // 2. Mutation Observer for Dynamic Messages (Feature #4 & #5)
    // We observe the body because LinkedIn is an SPA; entire sections might rerender.
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
        if (isCrawling) return;

        let shouldScrape = false;
        for (const m of mutations) {
            // Did a message list change?
            if (m.target.matches &&
                (m.target.matches(CONFIG.FULL_PAGE_CONTAINER) ||
                    m.target.matches(CONFIG.OVERLAY_CONTAINER))) {
                shouldScrape = true;
                break;
            }
            // Or were nodes added to a list?
            if (m.addedNodes.length > 0 &&
                m.target.classList &&
                (m.target.classList.contains("msg-s-message-list-content") ||
                    m.target.classList.contains("msg-s-message-list__event"))) {
                shouldScrape = true;
                break;
            }
        }

        if (shouldScrape) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(scrapeActiveConversation, 1500);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Listen for Messages from Popup/Background
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.type === "TRIGGER_Sidebar_SCAN") {
        if (window.location.href.includes("messaging")) {
            syncRecentChats(); // Feature #1: Full Crawl
        } else {
            scrapeActiveConversation(); // Just scrape current view
        }
        return; // Synchronous return
    }

    if (req.type === "CHECK_STATUS") {
        sendResponse({ status: isCrawling ? "crawling" : "idle" });
        return true;
    }

    if (req.type === "NAVIGATE_TO_CHAT") {
        const targetName = req.name;
        console.log("LinkBee: [NAVIGATE] Searching for chat by Name:", targetName);

        if (!targetName) {
            sendResponse({ success: false, reason: "No name provided" });
            return true;
        }

        const sidebar = document.querySelector(".msg-conversations-container__conversations-list");
        if (!sidebar) {
            console.warn("LinkBee: [NAVIGATE] Sidebar not found.");
            sendResponse({ success: false, reason: "Sidebar not found" });
            return true;
        }

        // Helper: Remove special chars, emojis, extra spaces, and lowercase
        // "Geetha Sagar Bonthu CSPO®" -> "geetha sagar bonthu cspo"
        const cleanName = (str) => {
            if (!str) return "";
            return str.toLowerCase()
                .replace(/[^\w\s]/g, "") // Remove non-word chars (except spaces)
                .replace(/\s+/g, " ")     // Collapse multiple spaces
                .trim();
        };

        const targetClean = cleanName(targetName);

        // ASYNC SEARCH LOOP
        (async () => {
            const startTime = Date.now();
            const timeout = 20000; // Increased to 20s

            sidebar.scrollTop = 0;
            await new Promise(r => setTimeout(r, 600));

            let found = false;

            while (Date.now() - startTime < timeout) {
                // 1. Scan current items
                const items = Array.from(sidebar.querySelectorAll(CONFIG.SIDEBAR_LIST_ITEM));

                for (const item of items) {
                    const nameRaw = item.querySelector('.msg-conversation-listitem__participant-names')?.innerText || "";
                    const nameClean = cleanName(nameRaw);

                    if (!nameClean) continue;

                    // Relaxed Match: Check if one contains the other (e.g. "Prasath R" vs "Prasath Rajasekaran")
                    if (nameClean.includes(targetClean) || targetClean.includes(nameClean)) {
                        console.log(`LinkBee: [NAVIGATE] Found match: "${nameRaw}" (Clean: "${nameClean}"). Clicking...`);

                        item.scrollIntoView({ behavior: "smooth", block: "center" });
                        await new Promise(r => setTimeout(r, 500));

                        // Click Strategy
                        const candidates = [
                            item.querySelector("a.msg-conversation-listitem__link"),
                            item.querySelector(".msg-conversation-card__content--selectable"),
                            item.querySelector("a"),
                            item
                        ];

                        for (const candidate of candidates) {
                            if (candidate) {
                                simulateClick(candidate);
                                candidate.click();
                            }
                        }

                        found = true;
                        break;
                    }
                }

                if (found) break;

                // 2. Not found? Scroll Down.
                console.log(`LinkBee: [NAVIGATE] Scanning... Target: "${targetClean}". Scrolling down...`);
                const previousTop = sidebar.scrollTop;
                sidebar.scrollBy({ top: 600, behavior: 'smooth' });

                // Wait for scroll & render (increased to 1s)
                await new Promise(r => setTimeout(r, 1000));

                // End of list check?
                if (Math.abs(sidebar.scrollTop - previousTop) < 5) {
                    console.log("LinkBee: [NAVIGATE] Reached bottom of list.");
                    break;
                }
            }

            if (!found) {
                console.warn(`LinkBee: [NAVIGATE] Timeout/Not Found for "${targetName}" (Clean: "${targetClean}") after ${timeout / 1000}s.`);
                sendResponse({ success: false, reason: "Timeout searching for name" });
            } else {
                sendResponse({ success: true });
            }
        })();

        return true;
    }
});

// Boot
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
