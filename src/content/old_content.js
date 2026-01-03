import { SELECTORS, APP_CONSTANTS } from '../utils/constants.js';
import apiObserverUrl from './api_observer.js?script';

console.log("LinkBee: Content script loaded");

// // Backwards compatibility mapping if I don't want to replace every usage immediately,
// // or I can just update usages.
// // Let's rely on the imported SELECTORS directly. 
// // Note: The original code used CONFIG.FULL_PAGE_CONTAINER etc.
// // I will map them to a local CONFIG like object to match existing code structure for minimal diffs first?
// // Or better, just alias them.

// const CONFIG = {
//     ...SELECTORS,
//     SELECTORS: SELECTORS // Self-reference for nested usages like CONFIG.SELECTORS.LIST_ITEM
// };

// // Identify the Current User (For distinguishing "Me" vs "Them" in ambiguous chats)
// function scrapeCurrentUser() {
//     // LinkedIn Global Nav usually has the user's photo with alt text = Name
//     const img = document.querySelector(".global-nav__me-photo");
//     if (img && img.alt) {
//         const name = img.alt.trim();
//         if (name) {
//             console.log("LinkBee: Identified User as", name);
//             chrome.storage.local.set({ userProfile: { name: name } });
//         }
//     }
// }

// // ... (Variable decls)
// let observer = null;
// let debounceTimer = null;
// let isCrawling = false; // Flag to prevent observer loops during crawl
// let isAnalyzing = false; // Track AI Analysis state

// // ... (Rest of code)

// function scrapeActiveConversation(fromCrawler = false) {
//     if (isCrawling && !fromCrawler) return; // Don't scrape individually if we are running a batch crawl

//     // 1. Identify Context (Full Page or Overlay?)
//     let container = document.querySelector(CONFIG.FULL_PAGE_CONTAINER);
//     let isOverlay = false;

//     if (!container) {
//         // Try overlay
//         const overlays = document.querySelectorAll(CONFIG.OVERLAY_CONTAINER);
//         // Find the visible/active overlay
//         for (const ov of overlays) {
//             if (ov.offsetParent !== null) { // Check visibility
//                 // We need the specific list inside
//                 container = ov.querySelector(".msg-s-message-list-content");
//                 isOverlay = true;
//                 break;
//             }
//         }
//     }

//     if (!container) {
//         console.warn("LinkBee: [SCRAPE FAIL] No chat container found. Are you on a messaging page?");
//         return;
//     }

//     // New Check: Ensure we actually found a conversation title or meaningful content
//     // to avoid scraping generic page noise as "Unknown"
//     const titleEl = document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE);
//     const hasOverlayTitle = isOverlay && container.closest(CONFIG.OVERLAY_CONTAINER)?.querySelector(".msg-overlay-bubble-header__title");

//     if (!titleEl && !hasOverlayTitle) {
//         // Fallback: If we can't find a title, check if we found any messages at all
//         // If 0 messages, we definitely shouldn't process.
//         if (container.children.length === 0) return;
//     }

//     // 2. Sequential Parse
//     const listItems = Array.from(container.children);
//     console.log(`LinkBee: Found ${ listItems.length } list items in container.`);

//     const messages = [];
//     let currentDateStr = "Today"; // Fallback

//     listItems.forEach(item => {
//         // ... (parsing logic) ...
//         // A. Is it a Date Header?
//         const dateHeader = item.querySelector(CONFIG.SELECTORS.DATE_HEADER);
//         if (dateHeader) {
//             currentDateStr = dateHeader.innerText.trim();
//         }

//         // B. Is it a Message?
//         const msgEl = item.querySelector(CONFIG.SELECTORS.MESSAGE_BUBBLE);
//         if (msgEl) {
//             // Extract Text
//             const body = msgEl.querySelector(CONFIG.SELECTORS.MESSAGE_BODY);
//             const text = body ? body.innerText.trim() : "[Media/Attachment]";
//             if (!text) return;

//             // Extract Sender
//             const isMe = !msgEl.classList.contains("msg-s-event-listitem--other");
//             let sender = isMe ? "Me" : "Them";
//             const nameEl = item.querySelector(CONFIG.SELECTORS.SENDER_NAME);
//             if (nameEl) sender = nameEl.innerText.trim();

//             // ... (time logic) ...
//             let timestamp = Date.now();
//             const exactIndicator = msgEl.querySelector(CONFIG.SELECTORS.TIMESTAMP_EXACT);
//             if (exactIndicator && exactIndicator.getAttribute("title")) {
//                 const raw = exactIndicator.getAttribute("title").replace("Sent at ", "").trim();
//                 timestamp = Date.parse(raw);
//             }
//             if (!timestamp || isNaN(timestamp)) {
//                 const groupTime = item.querySelector(CONFIG.SELECTORS.TIMESTAMP_GROUP);
//                 const timeStr = groupTime ? groupTime.innerText.trim() : "";
//                 timestamp = parseRelativeDate(currentDateStr, timeStr);
//             }

//             messages.push({
//                 text,
//                 sender,
//                 isMe,
//                 timestamp,
//                 dateHeader: currentDateStr
//             });
//         }
//     });

//     if (messages.length === 0) {
//         console.warn("LinkBee: [SCRAPE FAIL] No messages extracted from items.");
//         return;
//     }

//     // 3. Metadata
//     const lastMsg = messages[messages.length - 1];

//     // Find Title & URN
//     let title = "Unknown";
//     let urn = null;

//     // Helper to extract URN from HREF
//     const getUrnFromUrl = (u) => {
//         if (!u || !u.includes("/in/")) return null;
//         const match = u.match(/\/in\/([^\/]+)\/?/);
//         return match ? match[1] : null;
//     };

//     if (isOverlay) {
//         const bubble = container.closest(".msg-overlay-conversation-bubble");
//         if (bubble) {
//             const header = bubble.querySelector(".msg-overlay-bubble-header__title");
//             if (header) {
//                 title = header.innerText.trim();
//                 const link = header.querySelector("a");
//                 urn = getUrnFromUrl(link?.href);
//             }
//         }

//         // FALLBACK: If scoped lookup failed but we are in overlay mode, find ANY visible overlay header
//         // This fixes cases where DOM nesting might be deeper or `closest` fails
//         if (!urn) {
//             const visibleHeader = Array.from(document.querySelectorAll(".msg-overlay-bubble-header__title"))
//                 .find(h => h.offsetParent !== null && h.querySelector("a"));

//             if (visibleHeader) {
//                 if (title === "Unknown") title = visibleHeader.innerText.trim();
//                 const link = visibleHeader.querySelector("a");
//                 urn = getUrnFromUrl(link?.href);
//                 if (urn) console.log("LinkBee: [URN RECOVERY] Found URN via global visible header check");
//             }
//         }
//     } else {
//         const header = document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE);
//         if (header) title = header.innerText.trim();

//         const link = document.querySelector(".msg-thread__link-to-profile");
//         urn = getUrnFromUrl(link?.href);

//         // (Sidebar fallback removed as per user request)
//     }

//     // CLEANUP: Title often has newlines or multiple spaces
//     if (title && title !== "Unknown") {
//         title = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
//     }

//     // FALLBACK: If URN still null, check the message list for the OTHER person's profile link
//     if (!urn) {
//         // Iterate created messages to find the first "Them" sender
//         // Note: 'messages' is just data, we need to look at DOM or capture it during loop. 
//         // Re-scanning DOM for valid profile link:
//         const otherMsgItem = listItems.find(item => {
//             const msgEl = item.querySelector(CONFIG.SELECTORS.MESSAGE_BUBBLE);
//             if (!msgEl) return false;
//             return msgEl.classList.contains("msg-s-event-listitem--other");
//         });

//         if (otherMsgItem) {
//             const link = otherMsgItem.querySelector(CONFIG.SELECTORS.SENDER_LINK);
//             if (link) {
//                 urn = getUrnFromUrl(link.href);
//                 if (urn) console.log(`LinkBee: [URN FALLBACK] Found URN from message list: ${ urn } `);
//             }

//             // Double fallback: some layouts put the link on the image
//             if (!urn) {
//                 const imgLink = otherMsgItem.querySelector("a.msg-s-message-group__profile-link, a.ivm-image-view-model__link, .msg-facepile-grid__img");
//                 // Note: facepile img often doesn't have href, but its parent might
//                 // Let's check 'a' tags inside the group data
//                 const anyLink = otherMsgItem.querySelector(`a[href *= "/in/"]`);
//                 if (anyLink) urn = getUrnFromUrl(anyLink.href);
//             }
//         }
//     }

//     if (title === "Unknown" || title === "Me") {
//         if (!lastMsg.isMe) title = lastMsg.sender;
//     }

//     if (urn) {
//         console.log(`LinkBee: [URN MATCH] Scraped URN: ${ urn } for ${ title }`);
//     }

//     // 4. Send to Background
//     const payload = {
//         type: "NEW_CONVERSATION_DATA",
//         data: {
//             conversationName: title,
//             urn: urn, // UNIQUE IDENTIFIER
//             history: messages,
//             text: lastMsg.text,
//             sender: lastMsg.sender,
//             isMe: lastMsg.isMe,
//             timestamp: lastMsg.timestamp,
//             url: window.location.href
//         }
//     };

//     console.log(`LinkBee: [SENDING] ${ messages.length } msgs from "${title}".Last: "${lastMsg.text.substring(0, 20)}..."`);

//     if (chrome.runtime?.id) {
//         chrome.runtime.sendMessage(payload).then(res => {
//             console.log("LinkBee: [BACKGROUND_RESPONSE]", res);
//         }).catch(e => {
//             console.error("LinkBee: [SEND FAIL]", e);
//         });
//     }
// }

// async function scrapeProfileViews() {
//     console.log("LinkBee: [PROFILE_VIEWS] Starting scrape...");
//     showToast("LinkBee: Scanning Profile Views...", 3000);

//     // 1. Get Settings
//     const settings = await chrome.storage.local.get(['profileViewsDays']);
//     let lookbackDays = settings.profileViewsDays || APP_CONSTANTS.DEFAULT_PROFILE_VIEWS_LOOKBACK;
//     // Cap at 14 days as requested
//     if (lookbackDays > APP_CONSTANTS.DEFAULT_PROFILE_VIEWS_LOOKBACK) lookbackDays = APP_CONSTANTS.DEFAULT_PROFILE_VIEWS_LOOKBACK;

//     const cutoffDate = new Date();
//     cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
//     cutoffDate.setHours(0, 0, 0, 0);

//     console.log(`LinkBee: [PV] Lookback: ${ lookbackDays } days(Cutoff: ${ cutoffDate.toDateString() })`);

//     // Helper to parse "Viewed 5d ago", "Viewed 2w ago", "Viewed 1mo ago"
//     const parseViewTime = (text) => {
//         if (!text) return Date.now();
//         const now = Date.now();
//         const lower = text.toLowerCase();

//         let multiplier = 0;
//         let value = 0;

//         // Extract number
//         const match = lower.match(/(\d+)/);
//         if (match) value = parseInt(match[1]);

//         if (lower.includes('h') || lower.includes('m') && !lower.includes('mo')) {
//             // Hours or minutes -> treat as "Today"
//             return now;
//         } else if (lower.includes('d')) {
//             multiplier = 24 * 60 * 60 * 1000;
//         } else if (lower.includes('w')) {
//             multiplier = 7 * 24 * 60 * 60 * 1000;
//         } else if (lower.includes('mo')) {
//             multiplier = 30 * 24 * 60 * 60 * 1000;
//         } else if (lower.includes('y')) {
//             multiplier = 365 * 24 * 60 * 60 * 1000;
//         }

//         return now - (value * multiplier);
//     };

//     // 2. Pagination Loop
//     let reachedCutoff = false;
//     let attempts = 0;

//     while (!reachedCutoff && attempts < 20) { // Safety break

//         // Find all cards
//         // Refined Selector based on user HTML
//         const cards = Array.from(document.querySelectorAll("li.member-analytics-addon-entity-list__item, li.nt-card, .feed-shared-update-v2"));

//         if (cards.length === 0) {
//             console.log("LinkBee: [PV] No cards found yet. Waiting...");
//             await new Promise(r => setTimeout(r, 1000));
//             attempts++;
//             continue;
//         }

//         // Check the LAST card's time
//         const lastCard = cards[cards.length - 1];
//         const timeEl = lastCard.querySelector(".artdeco-entity-lockup__caption, .nt-card__time-text");
//         const timeText = timeEl ? timeEl.innerText.trim() : "";
//         const lastTimestamp = parseViewTime(timeText);

//         console.log(`LinkBee: [PV] Scanned ${ cards.length } cards.Last item: "${timeText}"(~${ new Date(lastTimestamp).toLocaleDateString() })`);

//         if (lastTimestamp < cutoffDate.getTime()) {
//             console.log("LinkBee: [PV] Reached cutoff date.");
//             reachedCutoff = true;
//         } else {
//             // Need more? Look for "Show more results" button
//             const loadMoreBtn = document.querySelector(".scaffold-finite-scroll__load-button");

//             if (loadMoreBtn) {
//                 console.log("LinkBee: [PV] Clicking 'Show more results'...");
//                 loadMoreBtn.click();
//                 await new Promise(r => setTimeout(r, 2000)); // Wait for load
//             } else {
//                 console.log("LinkBee: [PV] No 'Show more' button found. End of list?");
//                 // Try scrolling to bottom just in case it's infinite scroll without button
//                 window.scrollTo(0, document.body.scrollHeight);
//                 await new Promise(r => setTimeout(r, APP_CONSTANTS.SCROLL_DELAY));

//                 // If height didn't change much, we might be done
//                 reachedCutoff = true; // Break loop
//             }
//         }
//         attempts++;
//     }

//     // 3. Extraction (Final Pass)
//     const cards = Array.from(document.querySelectorAll("li.member-analytics-addon-entity-list__item, li.nt-card, .feed-shared-update-v2"));
//     const views = [];

//     cards.forEach(card => {
//         // Name
//         const nameEl = card.querySelector(".artdeco-entity-lockup__title, .nt-card__headline, .update-components-actor__name");
//         let name = nameEl ? nameEl.innerText.trim() : "Member";
//         // Clean name (remove "View profile", degree, premium icon text etc if they leak)
//         // The innerText often includes hidden span "View X's profile".
//         // Let's use the first visible text node if checking explicitly or trust innerText cleaning
//         // Actually, innerText usually strips hidden elements? Chrome does. 
//         // But the HTML shows <span class="visually-hidden">View Name...</span>. 
//         // innerText DOES include visually hidden text in some contexts or if CSS isn't fully computed by JSDOM (wait, this is real chrome).
//         // Chrome innerText ignores `display: none` but usually respects `visibility: hidden`? 
//         // To be safe: take the first part before newline if multiple lines
//         name = name.split("\n")[0].trim();

//         if (!name || name === "Member" || name === "LinkedIn Member") return;

//         // Headline
//         const headEl = card.querySelector(".artdeco-entity-lockup__subtitle, .nt-card__subtext, .update-components-actor__description");
//         const headline = headEl ? headEl.innerText.trim() : "";

//         // Time
//         const timeEl = card.querySelector(".artdeco-entity-lockup__caption, .nt-card__time-text, .update-components-actor__sub-description");
//         const timeStr = timeEl ? timeEl.innerText.trim() : "";
//         const timestamp = parseViewTime(timeStr);

//         // Filter by Cutoff
//         if (timestamp < cutoffDate.getTime()) return;

//         // Link
//         const linkEl = card.querySelector("a.member-analytics-addon-entity-list__link, .nt-card__image-link, .update-components-actor__container-link");
//         let url = linkEl ? linkEl.href : "";
//         if (url) {
//             try {
//                 const urlObj = new URL(url);
//                 url = urlObj.origin + urlObj.pathname;
//             } catch (e) { }
//         }

//         const id = url || name.replace(/\s+/g, '_');

//         views.push({
//             id,
//             name,
//             headline,
//             url,
//             timeStr, // e.g. "Viewed 5d ago"
//             scrapedAt: Date.now(),
//             type: 'profile_view'
//         });
//     });

//     if (views.length > 0) {
//         console.log(`LinkBee: [PV] Extracted ${ views.length } views(<= ${ lookbackDays } days).`);
//         if (chrome.runtime?.id) {
//             chrome.runtime.sendMessage({
//                 type: "PROFILE_VIEWS_DATA",
//                 data: views
//             }).catch(e => console.warn("LinkBee: [PV] Send failed (context invalidated)", e));
//         }
//         showToast(`LinkBee: Found ${ views.length } viewers!`, 3000);
//     } else {
//         console.log("LinkBee: [PV] No valid views found.");
//         showToast("LinkBee: No recent viewers found.", 3000);
//     }
// }

// async function syncRecentChats() {
//     const sidebar = document.querySelector(".msg-conversations-container__conversations-list");
//     if (!sidebar) {
//         alert("LinkBee: Please open the 'Messaging' tab to sync all chats.");
//         return;
//     }

//     isCrawling = true;
//     showToast("LinkBee: Starting Sync...", 3000);

//     // 0. Load Configuration
//     const settings = await chrome.storage.local.get(['syncDays']);
//     const syncDays = settings.syncDays || APP_CONSTANTS.DEFAULT_SYNC_DAYS; // Default to 30 days
//     const cutoffDate = new Date();
//     cutoffDate.setDate(cutoffDate.getDate() - syncDays);
//     cutoffDate.setHours(0, 0, 0, 0);

//     console.log(`LinkBee: [SYNC START] Mode = Filter Loop(${ syncDays } days).Cutoff: ${ cutoffDate.toDateString() } `);

//     // Reset sidebar to top
//     sidebar.scrollTop = 0;
//     await new Promise(r => setTimeout(r, APP_CONSTANTS.SCROLL_DELAY));

//     let items = Array.from(sidebar.querySelectorAll(CONFIG.SIDEBAR_LIST_ITEM));

//     // LOGGING (User Request)
//     console.log(`LinkBee: [SYNC START] Found ${ items.length } conversations in sidebar.`);
//     items.forEach((item, idx) => {
//         const namePart = item.querySelector('.msg-conversation-listitem__participant-names')?.innerText || "Unknown";
//         console.log(`LinkBee: Sidebar Item[${ idx }]: ${ namePart.trim() } `);
//     });

//     // Run until we hit the cutoff date (or run out of items)
//     let i = 0;
//     while (true) {
//         // If we've reached the end of the current DOM list, try scrolling
//         if (i >= items.length) {
//             console.log(`LinkBee: [SYNC] Reached end of current list(${ items.length }).Scrolling to load more...`);
//             const previousHeight = sidebar.scrollHeight;
//             sidebar.scrollBy({ top: 800, behavior: 'smooth' });

//             // Wait for LinkedIn to fetch/render
//             await new Promise(r => setTimeout(r, 2000));

//             // Re-fetch items from DOM
//             items = Array.from(sidebar.querySelectorAll(CONFIG.SIDEBAR_LIST_ITEM));
//             console.log(`LinkBee: [SYNC] Update: ${ items.length } total items in DOM.`);

//             // If no new items appeared, we are likely at the very end
//             if (i >= items.length) {
//                 console.log("LinkBee: [SYNC] No new items loaded after scroll. Stopping.");
//                 break;
//             }
//         }

//         const item = items[i];

//         // Extract Name from Sidebar for verification
//         const sidebarNameRaw = item.querySelector('.msg-conversation-listitem__participant-names')?.innerText || "";
//         const sidebarName = sidebarNameRaw.trim();

//         // IDENTIFY TIMESTAMP (User Request: Step 1)
//         const timeEl = item.querySelector('.msg-conversation-listitem__time-stamp') ||
//             item.querySelector('.msg-conversation-card__time-stamp');
//         const timeStr = timeEl ? timeEl.innerText.trim() : "Unknown Time";

//         // PARSE TIMESTAMP (User Request: Step 2)
//         // We use an empty string for the second arg because sidebar times are single strings (e.g. "6:54 PM", "Dec 12")
//         const parsedTimestamp = parseRelativeDate(timeStr, "");
//         const parsedDateObj = new Date(parsedTimestamp);

//         console.log(`LinkBee: [IDENTIFIED] Chat "${sidebarName}" | Last Timestamp: "${timeStr}"`);
//         console.log(`LinkBee: [PARSED] Chat "${sidebarName}" -> ${ parsedDateObj.toString() } (Diff: ${((Date.now() - parsedTimestamp) / 1000 / 3600 / 24).toFixed(1)} days ago)`);

//         // FILTER LOGIC (User Request: Step 3)
//         // "run the loop for the following condition: parsedDate >= Today - Dateconfigured"
//         if (parsedTimestamp < cutoffDate.getTime()) {
//             console.log(`LinkBee: [FILTER] STOPPING.Item "${sidebarName}"(${ parsedDateObj.toDateString() }) is older than ${ syncDays } days.`);
//             break;
//         }

//         // "Save" implies holding it for the next step (Filtering)
//         // currentItemData.timestamp = parsedTimestamp; 

//         // Highlight current item
//         item.style.borderLeft = "4px solid #0a66c2";
//         item.style.backgroundColor = "#e8f3ff";

//         let clicked = false;
//         // Scroll first with margin to avoid headers covering it
//         item.scrollIntoView({ behavior: "smooth", block: "center" });
//         await new Promise(r => setTimeout(r, 300)); // Wait for scroll to settle

//         // Click Strategy: Priority on the Link, then the Row
//         const link = item.querySelector(".msg-conversation-listitem__link") || item.querySelector("a");
//         const target = link || item;

//         if (target) {
//             // Check if already active
//             if (item.classList.contains("msg-conversation-listitem--active")) {
//                 clicked = true;
//             } else {
//                 // Try Native Click first
//                 target.click();

//                 // Backup: specific framework events if native fails to trigger routing
//                 // LinkedIn uses Ember/React, sometimes needs these
//                 if (!item.classList.contains("msg-conversation-listitem--active")) {
//                     simulateClick(target);
//                 }
//                 clicked = true;
//             }
//         }

//         if (clicked) {
//             showToast(`LinkBee: Opening ${ sidebarName || "Chat " + (i + 1) }...`);

//             // 2. WAIT FOR CONTENT MATCH
//             // We wait until the Chat Title roughly matches the Sidebar Name.
//             // This prevents scraping the previous chat if the new one fails to load.
//             let loaded = false;
//             let attempts = 0;
//             while (attempts < 10) { // 5 seconds max
//                 await new Promise(r => setTimeout(r, 500));

//                 const currentTitle = document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE)?.innerText?.trim();

//                 // Debug Log
//                 if (attempts % 2 === 0) {
//                     console.log(`LinkBee: Waiting for load...Sidebar = "${sidebarName}" Title = "${currentTitle}" ActiveClass = ${ item.classList.contains("msg-conversation-listitem--active") } `);
//                 }

//                 // Logic: 
//                 // 1. If sidebar name is empty/unknown, fall back to "active" class check + validation title changed
//                 // 2. If sidebar name exists, Chat Title must include it (or vice versa)
//                 if (sidebarName && currentTitle) {
//                     // Normalize for check
//                     if (currentTitle.toLowerCase().includes(sidebarName.toLowerCase()) ||
//                         sidebarName.toLowerCase().includes(currentTitle.toLowerCase())) {
//                         loaded = true;
//                         break;
//                     }
//                 } else if (!sidebarName && item.classList.contains("msg-conversation-listitem--active")) {
//                     // Fallback for "Unknown" or headerless chats
//                     loaded = true;
//                     break;
//                 }

//                 attempts++;
//             }

//             if (!loaded) {
//                 console.warn(`LinkBee: [WARN] Timeout waiting for title match.Sidebar = "${sidebarName}" vs Title = "${document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE)?.innerText}".Scraping anyway...`);
//                 // FALLBACK: User says UI changes, so trust the click and scrape anyway.
//                 scrapeActiveConversation(true);
//             } else {
//                 // 3. Scrape
//                 scrapeActiveConversation(true);
//             }
//         }

//         // Remove highlight
//         item.style.borderLeft = "";
//         item.style.backgroundColor = "";

//         i++;
//     }

//     isCrawling = false;
//     showToast("LinkBee: Sync Complete!", 3000);
//     console.log("LinkBee: Sync Complete.");

//     // Notify Background to run analysis now that data is fresh
//     if (chrome.runtime?.id) {
//         chrome.runtime.sendMessage({ type: "SCAN_COMPLETED" }).catch(e => console.warn("LinkBee: [SYNC] Send failed", e));
//     }
// }

// function simulateClick(element) {
//     const options = { bubbles: true, cancelable: true, view: window };
//     element.dispatchEvent(new MouseEvent('mousedown', options));
//     element.dispatchEvent(new MouseEvent('mouseup', options));
//     element.dispatchEvent(new MouseEvent('click', options));
// }

// // Visual Helper
// function showToast(text, duration = APP_CONSTANTS.TOAST_DURATION) {
//     let toast = document.getElementById('linkbee-toast');
//     if (!toast) {
//         toast = document.createElement('div');
//         toast.id = 'linkbee-toast';
//         toast.style.cssText = `
//             position: fixed;
//             bottom: 20px;
//             right: 20px;
//             background: #333;
//             color: white;
//             padding: 10px 20px;
//             border-radius: 8px;
//             z-index: 10000;
//             font-family: sans-serif;
//             font-size: 14px;
//             box-shadow: 0 4px 6px rgba(0,0,0,0.1);
//             transition: opacity 0.3s ease;
//         `;
//         document.body.appendChild(toast);
//     }
//     toast.innerText = text;
//     toast.style.opacity = '1';

//     if (duration > 0) {
//         setTimeout(() => {
//             toast.style.opacity = '0';
//         }, duration);
//     }
// }

// // ============================================================================
// // UTILITIES
// // ============================================================================

// function parseRelativeDate(dateStr, timeStr) {
//     const now = new Date();
//     let target = new Date();
//     const cleanDate = dateStr.trim().toLowerCase();

//     // Handle Date Part
//     // Check for "Today" OR Time-only strings (e.g. "6:54 PM", "10:30 am", "15:00")
//     if (cleanDate === "today" || /^\d{1,2}:\d{2}/.test(cleanDate)) {
//         // target is already now
//     } else if (cleanDate === "yesterday") {
//         target.setDate(now.getDate() - 1);
//     } else {
//         // Weekdays: "Monday", "Tuesday"...
//         const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
//         const dayIdx = days.indexOf(cleanDate);
//         if (dayIdx > -1) {
//             const currentIdx = now.getDay();
//             let diff = currentIdx - dayIdx;
//             if (diff <= 0) diff += 7;
//             target.setDate(now.getDate() - diff);
//         } else {
//             // Absolute Date: "Jul 8" or "Dec 12, 2023"
//             let parseStr = cleanDate;
//             // If no year, assume current year logic
//             if (!/\d{4}/.test(cleanDate)) {
//                 parseStr = `${cleanDate} ${now.getFullYear()}`;
//             }
//             const d = Date.parse(parseStr);
//             if (!isNaN(d)) {
//                 target = new Date(d);
//                 // Fix future date edge case (e.g. Scanning "Dec 31" in "Jan"):
//                 if (target > now) {
//                     target.setFullYear(now.getFullYear() - 1);
//                 }
//             }
//         }
//     }

//     // Handle Time Part (Merge "10:00 AM" into the date)
//     if (timeStr) {
//         const mergedString = `${target.toDateString()} ${timeStr}`;
//         const final = Date.parse(mergedString);
//         if (!isNaN(final)) return final;
//     }

//     // Fallback
//     return target.getTime();
// }

// // ============================================================================
// // OBSERVERS & INIT
// // ============================================================================

// // 0. Inject API Observer (Stealth Mode)
function injectObserver() {
    const script = document.createElement('script');
    // Ensure we use the full chrome-extension:// URL to satisfy LinkedIn's CSP
    const scriptUrl = apiObserverUrl.startsWith('chrome-extension')
        ? apiObserverUrl
        : chrome.runtime.getURL(apiObserverUrl);

    script.src = scriptUrl;
    script.onload = function () {
        this.remove(); // Clean up after injection
        console.log("LinkBee: Injected api_observer.js");
    };
    (document.head || document.documentElement).appendChild(script);
}

function init() {
    // -1. Inject Observer
    injectObserver();
}

// 0. Sync Status
//     scrapeCurrentUser();
//     chrome.storage.local.get(['isAnalyzing'], (res) => {
//         isAnalyzing = res.isAnalyzing || false;
//         checkBannerState();
//     });

//     chrome.storage.onChanged.addListener((changes, namespace) => {
//         if (namespace === 'local' && changes.isAnalyzing) {
//             isAnalyzing = changes.isAnalyzing.newValue;
//             checkBannerState();
//         }
//     });

//     // 1. Initial Scrape if on a chat
//     setTimeout(scrapeActiveConversation, APP_CONSTANTS.NAVIGATE_TIMEOUT / 10); // 2000ms

//     // 2. Mutation Observer for Dynamic Messages (Feature #4 & #5)
//     // We observe the body because LinkedIn is an SPA; entire sections might rerender.
//     if (observer) observer.disconnect();

//     observer = new MutationObserver((mutations) => {
//         if (isCrawling) return;

//         let shouldScrape = false;
//         for (const m of mutations) {
//             // Did a message list change?
//             if (m.target.matches &&
//                 (m.target.matches(CONFIG.FULL_PAGE_CONTAINER) ||
//                     m.target.matches(CONFIG.OVERLAY_CONTAINER))) {
//                 shouldScrape = true;
//                 break;
//             }
//             // Or were nodes added to a list?
//             if (m.addedNodes.length > 0 &&
//                 m.target.classList &&
//                 (m.target.classList.contains("msg-s-message-list-content") ||
//                     m.target.classList.contains("msg-s-message-list__event"))) {
//                 shouldScrape = true;
//                 break;
//             }
//         }

//         if (shouldScrape) {
//             clearTimeout(debounceTimer);
//             debounceTimer = setTimeout(scrapeActiveConversation, APP_CONSTANTS.SCROLL_DELAY);
//         }

//         // Update UI State
//         checkBannerState();
//     });

//     observer.observe(document.body, { childList: true, subtree: true });

//     // 3. Floating Banner (User Request)
//     createFloatingBanner();
// }

// // ============================================================================
// // UI OVERLAY (Floating Banner)
// // ============================================================================

// function createFloatingBanner() {
//     if (document.getElementById('linkbee-floating-banner')) return;

//     const banner = document.createElement('div');
//     banner.id = 'linkbee-floating-banner';

//     // Icon
//     const iconUrl = chrome.runtime.getURL("assets/icon48.png");
//     banner.innerHTML = `<img src="${iconUrl}" alt="LinkBee" />`;

//     // Click Action: Open Side Panel + Show Status
//     banner.onclick = () => {
//         // 1. Notify Background to Open Panel
//         if (chrome.runtime?.id) {
//             chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }).catch(e => console.warn("LinkBee: [UI] Send failed", e));
//         } else {
//             alert("LinkBee: Extension context invalidated. Please reload the page.");
//         }

//         // 2. Show Status Toast
//         const isCrawlingDef = typeof isCrawling !== 'undefined' ? isCrawling : false;
//         let status = 'Idle';
//         if (isCrawlingDef) status = 'Syncing...';
//         if (isAnalyzing) status = 'Analyzing (AI)...';

//         showToast(`LinkBee is Active. Status: ${status}`, 3000);
//     };

//     document.body.appendChild(banner);

//     // Inject CSS
//     const style = document.createElement('style');
//     style.innerHTML = `
//         #linkbee-floating-banner {
//             position: fixed;
//             top: 50%;
//             right: 0;
//             transform: translateY(-50%);
//             width: 40px;
//             height: 40px;
//             background-color: #333;
//             border-radius: 8px 0 0 8px;
//             box-shadow: -2px 0 5px rgba(0,0,0,0.2);
//             z-index: 999999;
//             cursor: pointer;
//             display: flex;
//             align-items: center;
//             justify-content: center;
//             transition: all 0.3s ease;
//             opacity: 0.8;
//         }
//         #linkbee-floating-banner:hover {
//             width: 50px;
//             opacity: 1;
//         }
//         #linkbee-floating-banner img {
//             width: 24px;
//             height: 24px;
//             pointer-events: none;
//         }
//         /* Active Glow State */
//         #linkbee-floating-banner.linkbee-active-glow {
//             background-color: #0a66c2; /* LinkedIn Blue */
//             box-shadow: 0 0 15px #0a66c2, inset 0 0 5px rgba(255,255,255,0.5);
//             width: 45px;
//             opacity: 1;
//         }
//     `;
//     document.head.appendChild(style);

//     // Initial Check
//     checkBannerState();
// }

// function checkBannerState() {
//     const banner = document.getElementById('linkbee-floating-banner');
//     if (!banner) return;

//     // Condition: Glow ONLY when Analyzing (User Request)
//     if (isAnalyzing) {
//         if (!banner.classList.contains('linkbee-active-glow')) {
//             banner.classList.add('linkbee-active-glow');
//         }
//     } else {
//         if (banner.classList.contains('linkbee-active-glow')) {
//             banner.classList.remove('linkbee-active-glow');
//         }
//     }
// }

// // Listen for Messages from Popup/Background
// chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
//     if (req.type === "TRIGGER_Sidebar_SCAN") {
//         if (window.location.href.includes("messaging")) {
//             syncRecentChats(); // Feature #1: Full Crawl
//         } else if (!window.location.href.includes("profile-views")) {
//             // Only scrape active conversation if we are NOT on profile views page
//             // (active conversation scraper is meant for overlay chats on other pages)
//             scrapeActiveConversation();
//         } else {
//             console.log("LinkBee: [SKIP] Sidebar scan skipped for Profile Views page.");
//         }
//         return; // Synchronous return
//     }

//     if (req.type === "TRIGGER_PROFILE_VIEWS_SCAN") {
//         if (window.location.href.includes("profile-views")) {
//             scrapeProfileViews();
//         } else {
//             console.warn("LinkBee: Not on profile views page.");
//         }
//         return;
//     }

//     if (req.type === "CHECK_STATUS") {
//         sendResponse({ status: isCrawling ? "crawling" : "idle" });
//         return true;
//     }

//     if (req.type === "NAVIGATE_TO_CHAT") {
//         const targetName = req.name;
//         console.log("LinkBee: [NAVIGATE] Searching for chat by Name:", targetName);

//         if (!targetName) {
//             sendResponse({ success: false, reason: "No name provided" });
//             return true;
//         }

//         const sidebar = document.querySelector(".msg-conversations-container__conversations-list");
//         if (!sidebar) {
//             console.warn("LinkBee: [NAVIGATE] Sidebar not found.");
//             sendResponse({ success: false, reason: "Sidebar not found" });
//             return true;
//         }

//         // Helper: Remove special chars, emojis, extra spaces, and lowercase
//         // "Geetha Sagar Bonthu CSPO®" -> "geetha sagar bonthu cspo"
//         const cleanName = (str) => {
//             if (!str) return "";
//             return str.toLowerCase()
//                 .replace(/[^\w\s]/g, "") // Remove non-word chars (except spaces)
//                 .replace(/\s+/g, " ")     // Collapse multiple spaces
//                 .trim();
//         };

//         const targetClean = cleanName(targetName);

//         // ASYNC SEARCH LOOP
//         (async () => {
//             const startTime = Date.now();
//             const timeout = APP_CONSTANTS.NAVIGATE_TIMEOUT; // Increased to 20s

//             sidebar.scrollTop = 0;
//             await new Promise(r => setTimeout(r, 600));

//             let found = false;

//             while (Date.now() - startTime < timeout) {
//                 // 1. Scan current items
//                 const items = Array.from(sidebar.querySelectorAll(CONFIG.SIDEBAR_LIST_ITEM));

//                 for (const item of items) {
//                     const nameRaw = item.querySelector('.msg-conversation-listitem__participant-names')?.innerText || "";
//                     const nameClean = cleanName(nameRaw);

//                     if (!nameClean) continue;

//                     // Relaxed Match: Check if one contains the other (e.g. "Prasath R" vs "Prasath Rajasekaran")
//                     if (nameClean.includes(targetClean) || targetClean.includes(nameClean)) {
//                         console.log(`LinkBee: [NAVIGATE] Found match: "${nameRaw}" (Clean: "${nameClean}"). Clicking...`);

//                         item.scrollIntoView({ behavior: "smooth", block: "center" });
//                         await new Promise(r => setTimeout(r, 500));

//                         // Click Strategy
//                         const candidates = [
//                             item.querySelector("a.msg-conversation-listitem__link"),
//                             item.querySelector(".msg-conversation-card__content--selectable"),
//                             item.querySelector("a"),
//                             item
//                         ];

//                         for (const candidate of candidates) {
//                             if (candidate) {
//                                 simulateClick(candidate);
//                                 candidate.click();
//                             }
//                         }

//                         found = true;
//                         break;
//                     }
//                 }

//                 if (found) break;

//                 // 2. Not found? Scroll Down.
//                 console.log(`LinkBee: [NAVIGATE] Scanning... Target: "${targetClean}". Scrolling down...`);
//                 const previousTop = sidebar.scrollTop;
//                 sidebar.scrollBy({ top: 600, behavior: 'smooth' });

//                 // Wait for scroll & render (increased to 1s)
//                 await new Promise(r => setTimeout(r, 1000));

//                 // End of list check?
//                 if (Math.abs(sidebar.scrollTop - previousTop) < 5) {
//                     console.log("LinkBee: [NAVIGATE] Reached bottom of list.");
//                     break;
//                 }
//             }

//             if (!found) {
//                 console.warn(`LinkBee: [NAVIGATE] Timeout/Not Found for "${targetName}" (Clean: "${targetClean}") after ${timeout / 1000}s.`);
//                 sendResponse({ success: false, reason: "Timeout searching for name" });
//             } else {
//                 sendResponse({ success: true });
//             }
//         })();

//         return true;
//     }
// });

// // Boot
// if (document.readyState === "loading") {
//     document.addEventListener("DOMContentLoaded", init);
// } else {
//     init();
// }


// src/content/content.js

// ... existing code ...

// src/content/content.js

// ... (Your imports and injectObserver setup remain the same) ...

window.addEventListener('LinkBee_Inbound_API', (e) => {
    const { url, response } = e.detail;
    console.log("LinkBee: [API] Captured API data.", url, response);
    // Filter: Check for messaging specific endpoints
    // Note: 'messengerMessages' handles the updates/deltas
    // Added 'voyagerMessagingGraphQL' to capture the GraphQL versions of these calls
    if (url.includes('/voyager/api/messaging/conversations') ||
        url.includes('messengerMessages') ||
        url.includes('voyagerMessagingGraphQL')) {

        // DEBUG: Check storage availability
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            console.error("LinkBee: [CRITICAL] chrome.storage.local is MISSING inside content script!", {
                hasChrome: typeof chrome !== 'undefined',
                hasStorage: typeof chrome !== 'undefined' && !!chrome.storage
            });
        }

        // 1. Capture Sync Token (if present) to optimize future calls
        // GraphQL often has it in data.messengerMessagesBySyncToken.metadata
        let token = response?.data?.messengerMessagesBySyncToken?.metadata?.newSyncToken ||
            response?.metadata?.newSyncToken; // REST fallback

        if (token) {
            chrome.storage.local.set({ 'linkbee_sync_token': token });
            console.log("LinkBee: [SYNC] Saved new token:", token);
        }

        // Pass 'profileIdHint' from URL variables if available
        const payload = transformApiData(response);

        if (payload && payload.length > 0) {
            console.log(`LinkBee: [API] Captured ${payload.length} conversation updates.`);
            chrome.runtime.sendMessage({
                type: 'NEW_CONVERSATION_DATA_BATCH',
                data: payload
            });
        }
    }
});

// Helper: Extract valid Profile ID (ACoAA...) from various URN formats
function extractProfileId(urn) {
    if (!urn) return null;
    // Handle: urn:li:fsd_profile:ACoAAB...
    // Handle: urn:li:msg_messagingParticipant:urn:li:fsd_profile:ACoAAB...
    const match = urn.match(/fsd_profile:([^,)]+)/);
    return match ? match[1] : null;
}

// Helper: Determine the best storage key (Legacy Compat)
function resolveConversationKey(conversationUrn, participants) {
    // 1. Try to find the Partner (1:1 Chat)
    // We assume "Me" is the viewer. The other person is the partner.
    // If we can't reliably identifying "Me", we check for the participant that ISN'T a company.
    // But for now, let's assume if there are 2 people, the 'other' one is the key.

    // A. Filter out "Me" if possible (Check global nav or generic logic)
    // Basic "Me" check: The user usually appears as the 'viewer' or we can check the profile link in the DOM
    // For now, let's look for the participant with a valid Profile ID.

    let partner = null;

    if (participants && participants.length > 0) {
        // Simple Heuristic: In a 1:1, usually one is Me, one is Them.
        // We often don't know "Me" URN in the content script without scraping.
        // However, we can use the 'title' vs 'name' check?
        // Better: Just collect all Profile IDs. 
        // If we have a stored "userProfile" from previous scraping, use it?

        // Hard mode: API doesn't tell us "isMe" in the participant list directly unless we check `urn:li:member:ME`.
        // But `fsd_profile` is opaque.

        // Wait! The message update `sender` field often has `hostIdentityUrn` (Me?). 
        // Let's assume for now valid Profile IDs are good candidates.

        // Filter valid participants
        const validParticipants = participants.filter(p => p.urn && p.urn.includes("fsd_profile"));

        // Find Partner (Not Me)
        // distance: 'SELF' is reliable in the payload I saw.
        const other = validParticipants.find(p => p.distance !== 'SELF' && p.distance !== 'You');

        if (other) {
            partner = other;
        } else if (validParticipants.length === 2) {
            // 1:1 Chat - One is Me, One is Partner.
            // We need to know which one is Me to pick the OTHER.
            // Does the DOM tell us?
            // document.querySelector(".global-nav__me-photo").alt == My Name
            const myName = document.querySelector(".global-nav__me-photo")?.alt?.trim();

            if (myName) {
                partner = validParticipants.find(p => p.name !== myName);
            }
        } else if (validParticipants.length === 1) {
            // Just one person? (Self chat or deleted?)
            partner = validParticipants[0];
        }
    }

    if (partner) {
        const profileId = extractProfileId(partner.urn);
        if (profileId) return profileId; // Legacy Key (ACoAA...)
    }

    // 2. Fallback: Use Thread URN (Group chats, or if we failed to ID partner)
    return conversationUrn;
}

function getParticipantDetails(participant) {
    if (!participant) return null;
    let name = "Member";
    let headline = "";
    let distance = "";
    let urn = participant.entityUrn || participant.urn?.toString() || participant.string;

    // 1. Try messagingMember (Standard)
    if (participant.messagingMember) {
        const mini = participant.messagingMember.miniProfile;
        if (mini) {
            name = `${mini.firstName} ${mini.lastName}`.trim();
            headline = mini.occupation || "";
            // Extract Distance
            if (participant.messagingMember.distance) {
                distance = participant.messagingMember.distance;
            }
        }
    }
    // 2. Try company/sponsored (Ads)
    else if (participant.sponsoredParticipant) {
        name = participant.sponsoredParticipant.companyName || "Sponsored";
        headline = "Sponsored Message";
    }

    // Check top level distance if not in messagingMember (API variance)
    if (!distance && participant.participantType?.member?.distance) {
        distance = participant.participantType.member.distance;
    }

    return { name, urn, headline, distance };
}

function transformApiData(apiData, _deprecatedHint) {
    // 1. Normalize Input (List vs Delta Sync vs History)
    let elements = [];

    // Case A: Full Conversation List
    if (apiData.elements) {
        elements = apiData.elements;
    }
    // Case B: GraphQL Data Wrappers
    else if (apiData.data) {
        // Helper to extract list from wrapper
        const extractList = (obj) => obj?.elements || obj?.events;

        // 1. Delta Sync
        if (apiData.data.messengerMessagesBySyncToken) {
            elements = extractList(apiData.data.messengerMessagesBySyncToken);
        }
        // 2. History/Scroll (Anchor Timestamp)
        else if (apiData.data.messengerMessagesByAnchorTimestamp) {
            elements = extractList(apiData.data.messengerMessagesByAnchorTimestamp);
        }
        // 3. Generic/Search (messengerMessages)
        else if (apiData.data.messengerMessages) {
            elements = extractList(apiData.data.messengerMessages);
        }
        // 4. Conversation List (messengerConversationsByCategoryQuery)
        else if (apiData.data.messengerConversationsByCategoryQuery) {
            elements = extractList(apiData.data.messengerConversationsByCategoryQuery);
        }
    }

    // 4. Fallback: Check 'included' array (Side-loaded data)
    if ((!elements || elements.length === 0) && apiData.included) {
        // If we have included entities, they might be the messages themselves
        elements = apiData.included;
        console.log("LinkBee: [DEBUG] Found data in 'included' array (Length: " + elements.length + ")");
    }

    if (!elements || elements.length === 0) {
        return null;
    }

    const conversations = [];

    elements.forEach(element => {
        try {
            // A. Conversations Endpoint (List)
            if (element.entityUrn && element.entityUrn.includes("fs_conversation")) {
                const conversationUrn = element.entityUrn;

                // Identify "Them" (Non-Me Participant)
                const participants = (element.participants || []).map(getParticipantDetails);

                // HYBRID ID STRATEGY: Resolve legacy key (Profile ID) if possible
                let legacyKey = resolveConversationKey(conversationUrn, participants);

                const title = participants[0]?.name || "Unknown";
                const headline = participants[0]?.headline || "";

                // Get Last Message
                const events = element.events || [];
                const lastEvent = events[0];

                if (lastEvent) {
                    const isSponsored = lastEvent.subtype === 'SPONSORED_MESSAGE' ||
                        participants.some(p => p.name === "Sponsored");

                    // FILTER: Ignore Ads if requested (kept flag for decision layer)

                    let text = "[Media/Attachment]";
                    if (events.length > 0) {
                        const lastEvent = events[0]; // Usually first in list is latest
                        if (lastEvent.eventContent && lastEvent.eventContent.string) {
                            lastMessageText = lastEvent.eventContent.string;
                        } else if (lastEvent.eventContent && lastEvent.eventContent.attributedBody) {
                            lastMessageText = lastEvent.eventContent.attributedBody.text;
                        }
                        lastMessageTimestamp = lastEvent.createdAt;
                        lastSenderUrn = lastEvent.from?.string;
                    }

                    conversations.push({
                        urn: legacyKey || conversationUrn, // Use Legacy Key (ACoAA...) if found, else Thread URN
                        threadUrn: conversationUrn, // Keep reference to real API Thread URN
                        title: element.title || "New Conversation",
                        participants: participants,
                        text: lastMessageText,
                        timestamp: lastMessageTimestamp,
                        senderUrn: lastSenderUrn,
                        isDelta: false
                    });
                }
            }
            // B. Messages Endpoint (Delta) - It returns Events directly
            // For delta sync, we often get single events of type 'fs_event'
            else if ((element.entityUrn && element.entityUrn.includes("fs_event")) ||
                (element._type && element._type === "com.linkedin.messenger.Message") ||
                (element.entityUrn && element.entityUrn.includes("msg_message"))) {

                const conversationUrn = element.backendConversationUrn || element.conversationUrn; // e.g. urn:li:messagingThread:...

                if (conversationUrn) {
                    let text = "[New Message]";

                    // 1. Try 'body' (Message format)
                    if (element.body && element.body.text) {
                        text = element.body.text;
                    }
                    // 2. Try 'eventContent' (Event format)
                    else if (element.eventContent) {
                        if (element.eventContent.attributedBody && element.eventContent.attributedBody.text) {
                            text = element.eventContent.attributedBody.text;
                        } else if (element.eventContent.string) {
                            text = element.eventContent.string;
                        }
                    }

                    // Sender URN extraction
                    let senderUrn = null;
                    if (element.sender && element.sender.entityUrn) {
                        senderUrn = element.sender.entityUrn; // Message format
                    } else if (element.from) {
                        senderUrn = element.from.string || element.from; // Event format
                    }

                    // PRIORITY: Use Hint if available (Delta updates usually lack participant list)
                    const finalKey = conversationUrn.toString();

                    conversations.push({
                        urn: finalKey,
                        threadUrn: conversationUrn.toString(), // Explicitly send Thread URN for reference
                        title: "Unknown (Update)",
                        text: text,
                        timestamp: element.createdAt || element.deliveredAt,
                        senderUrn: senderUrn,
                        isSponsored: element.subtype === "SPONSORED_MESSAGE",
                        isDelta: true
                    });
                }
            }

        } catch (err) {
            console.warn("LinkBee: Error parsing item:", err);
        }
    });

    return conversations;
}

// Boot
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}