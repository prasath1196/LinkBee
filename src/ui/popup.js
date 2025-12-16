import { aiService } from '../utils/ai_service.js';

// Logic
document.addEventListener('DOMContentLoaded', init);

// Tabs
// Tabs
const tabFollowups = document.getElementById('tab-followups');
const tabProfileViews = document.getElementById('tab-profile-views');
const tabReminders = document.getElementById('tab-reminders');
const viewFollowups = document.getElementById('view-followups');
const viewProfileViews = document.getElementById('view-profile-views');
const viewReminders = document.getElementById('view-reminders');

// Carousel State
let currentCardIndex = 0;
let currentFollowupItems = [];
let currentProfileViews = [];

if (tabFollowups && tabReminders && tabProfileViews) {
    tabFollowups.addEventListener('click', () => switchTab('followups'));
    tabProfileViews.addEventListener('click', () => switchTab('profile_views'));
    tabReminders.addEventListener('click', () => switchTab('reminders'));
}

function switchTab(tab) {
    // Reset all
    [tabFollowups, tabProfileViews, tabReminders].forEach(t => {
        t.classList.remove('active');
        t.style.color = '#9ca3af';
        t.style.borderBottomColor = 'transparent';
    });
    [viewFollowups, viewProfileViews, viewReminders].forEach(v => v.classList.add('hidden'));

    if (tab === 'followups') {
        tabFollowups.classList.add('active');
        tabFollowups.style.color = '#2563eb';
        tabFollowups.style.borderBottomColor = '#2563eb';
        viewFollowups.classList.remove('hidden');
    } else if (tab === 'profile_views') {
        tabProfileViews.classList.add('active');
        tabProfileViews.style.color = '#2563eb';
        tabProfileViews.style.borderBottomColor = '#2563eb';
        viewProfileViews.classList.remove('hidden');
    } else {
        tabReminders.classList.add('active');
        tabReminders.style.color = '#2563eb';
        tabReminders.style.borderBottomColor = '#2563eb';
        viewReminders.classList.remove('hidden');
    }
}

async function init() {
    // Check for updates
    chrome.storage.local.get(['needsReload', 'isAnalyzing'], (data) => {
        if (data.needsReload) {
            chrome.runtime.sendMessage({ type: "ACK_RELOAD" });
        }
        toggleAnalysisLoader(data.isAnalyzing);
    });

    // Listen for Analysis State
    // Listen for Analysis State & Data Changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.isAnalyzing) {
                toggleAnalysisLoader(changes.isAnalyzing.newValue);
            }
            // Live Update: If data sources change, reload the view
            if (changes.notifications || changes.conversations || changes.reminders || changes.profileViews) {
                loadData();
            }
        }
    });

    // --- Sync Button Logic ---
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            const icon = syncBtn.querySelector('svg');
            icon.classList.add('spin-anim'); // Add simple spin CSS if available, or just visual feedback

            try {
                // Send message to background to Start Scan
                await chrome.runtime.sendMessage({ action: 'FORCE_SCAN' });
                // We reload data after a short delay to allow scan to initiate/complete partially?
                // Actually, FORCE_SCAN is async. It triggers content script.
                // We should listen for 'SCAN_COMPLETED' or just wait a bit.
                // For now, let's just reload this view after 2 seconds to show *something* if it was fast.
                setTimeout(async () => {
                    await loadData();
                    icon.classList.remove('spin-anim');
                }, 2000);
            } catch (e) {
                console.error("LinkBee: Sync failed", e);
                icon.classList.remove('spin-anim');
            }
        });
    }

    // --- Manual Reminder Logic ---
    const btnAdd = document.getElementById('btn-add-reminder');
    const formBox = document.getElementById('manual-reminder-form');
    const btnSave = document.getElementById('btn-save-manual-reminder');

    if (btnAdd && formBox) {
        btnAdd.addEventListener('click', () => {
            formBox.classList.toggle('hidden');
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const text = document.getElementById('manual-rem-text').value;
            const url = document.getElementById('manual-rem-url').value;
            const dateVal = document.getElementById('manual-rem-date').value;

            if (!text) return; // Simple validation

            let dueDate = null;
            if (dateVal) {
                dueDate = new Date(dateVal + 'T12:00:00').getTime();
            } else {
                // Default to today? or just null
                dueDate = Date.now();
            }

            const payload = {
                id: crypto.randomUUID(),
                // Manual reminders don't have a linked conversation ID necessarily
                conversationId: 'manual',
                conversationName: "Manual Task",
                text: text,
                dueDate: dueDate,
                url: url,
                createdDate: Date.now(),
                source: 'user_manual',
                status: 'pending'
            };

            await chrome.runtime.sendMessage({ type: 'ADD_REMINDER', data: payload });
            // Reload to show
            window.location.reload();
        });
    }

    switchTab('followups'); // Default
    await loadData();
}

async function loadData() {
    const data = await chrome.storage.local.get(['conversations', 'reminders', 'notifications', 'profileViews']);
    const convs = data.conversations || {};
    const totalScanned = Object.keys(convs).length;
    const notifications = data.notifications || {};
    const totalNotifications = Object.keys(notifications).length;

    // --- 1. Follow-ups (AI Opportunities) ---
    // Include YES decisions AND Pending (no decision yet but active)
    // --- 1. Follow-ups (AI Opportunities) ---
    // User Request: "Show the data inside notiications in local storage... do not need any filters."
    const followups = Object.values(notifications)
        .map(n => {
            // Match with conversationId if available
            const conv = convs[n.conversationId] || {};

            return {
                ...n, // Spread notification data (message, reason, etc.)
                // CRITICAL: Actions (Dismiss, Reminder) use 'id' which expects Conversation ID
                id: n.conversationId,
                // Original Notification ID (in case we need it specifically, though actions currently use convID)
                notificationId: n.id,
                // Fallback validities
                name: n.name || conv.name || "Unknown",
                lastMessage: conv.lastMessage || "",
                lastSenderIsMe: conv.lastSenderIsMe,
                url: n.url || conv.url
            };
        })
        .sort((a, b) => {
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

    currentFollowupItems = followups;
    renderFollowupsList(totalScanned); // Render List

    // --- 1.5 Profile Views ---
    const pViews = data.profileViews || {};
    // Convert to array and sort by time (recency)
    currentProfileViews = Object.values(pViews).sort((a, b) => (b.scrapedAt || 0) - (a.scrapedAt || 0));
    renderProfileViewsList();

    // --- 2. Reminders (Top Level) ---
    // User Request: Show reminder data from reminders in local storage
    const rawReminders = data.reminders || [];
    let allReminders = rawReminders
        .filter(r => r.status !== 'done')
        .map(r => {
            // Enrich with conversation name if available in conversations store
            const c = convs[r.conversationId];
            return {
                ...r,
                conversationName: c ? c.name : (r.conversationName || "Unknown"),
                conversationId: r.conversationId
            };
        });

    // --- 2. Reminders Loop ---
    // User logic: Split into Today and Upcoming
    const todayStr = new Date().toDateString();

    // Sort all first
    // Filter out 'triggered' or 'done' if you consider duplicates, but usually we just want pending
    // We already filter status !== 'done' above.

    const todayItems = [];
    const upcomingItems = [];

    allReminders.forEach(r => {
        if (!r.dueDate) {
            upcomingItems.push(r);
            return;
        }
        const d = new Date(r.dueDate);
        if (d.toDateString() === todayStr || d < new Date()) {
            // Due today OR Overdue (show in Today to be safe)
            todayItems.push(r);
        } else {
            upcomingItems.push(r);
        }
    });

    renderSplitReminders(todayItems, upcomingItems);
}

function renderSplitReminders(todayItems, upcomingItems) {
    const listToday = document.getElementById('list-today');
    const listUpcoming = document.getElementById('list-upcoming');
    const emptyState = document.getElementById('empty-state-reminders');
    const headers = document.querySelectorAll('#view-reminders h2'); // Section headers

    listToday.innerHTML = '';
    listUpcoming.innerHTML = '';

    const hasItems = todayItems.length > 0 || upcomingItems.length > 0;

    if (!hasItems) {
        listToday.style.display = 'none';
        listUpcoming.style.display = 'none';
        headers.forEach(h => h.style.display = 'none');
        emptyState.classList.remove('hidden');
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.classList.add('hidden');
    emptyState.style.display = 'none';
    headers.forEach(h => h.style.display = 'block');
    listToday.style.display = 'block';
    listUpcoming.style.display = 'block';

    // Render duplicates logic
    const renderCard = (container, item) => {
        const el = document.createElement('div');
        el.className = 'card-padding glass-panel';
        el.style.marginBottom = '12px';

        const dateStr = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No date';

        // Check if URL is valid
        const hasLink = item.url || (item.conversationId && item.conversationId !== 'manual');
        const linkUrl = item.url ? item.url : `https://www.linkedin.com/messaging/thread/${item.conversationId}/`;

        el.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h3 style="font-weight: 600; font-size: 0.9rem;">${item.conversationName || 'Reminder'}</h3>
                    <p class="text-xs text-gray-500 mb-2">Due: ${dateStr}</p>
                    <p style="font-size: 0.9rem;">🔔 ${item.text}</p>
                </div>
                <button class="dismiss-rem-btn icon-btn" title="Mark Done" style="color: #10b981;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            </div>
            ${hasLink ? `
            <div style="margin-top: 8px;">
                 <a href="#" data-url="${linkUrl}" class="chat-link-btn btn-secondary" style="display: block; text-align: center; font-size: 0.8rem; padding: 4px;">    
                    Go to Link
                </a>
            </div>` : ''}
        `;

        // Listeners
        el.querySelector('.dismiss-rem-btn').onclick = async () => {
            // Fixed Dismiss Logic
            await chrome.runtime.sendMessage({
                type: 'DISMISS_REMINDER',
                reminderId: item.id,
                conversationId: item.conversationId
            });
            // Remove element locally for instant feedback
            el.remove();
            // Ideally reload data to refresh lists correctly
            // loadData(); // Optional, but el.remove() feels snappier
        };

        const chatLink = el.querySelector('.chat-link-btn');
        if (chatLink) {
            chatLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: chatLink.getAttribute('data-url') });
            });
        }

        container.appendChild(el);
    };

    todayItems.forEach(i => renderCard(listToday, i));
    upcomingItems.forEach(i => renderCard(listUpcoming, i));

    // Hide empty sections if needed (optional polish)
    if (todayItems.length === 0) {
        listToday.innerHTML = '<p class="text-xs text-gray-500" style="font-style:italic;">No reminders due today.</p>';
    }
    if (upcomingItems.length === 0) {
        listUpcoming.innerHTML = '<p class="text-xs text-gray-500" style="font-style:italic;">No upcoming reminders.</p>';
    }
}

function renderFollowupsList(totalScanned = 0) {
    const list = document.getElementById('followup-list');
    const empty = document.getElementById('empty-state-followups');
    const emptyTitle = empty.querySelector('p:nth-of-type(1)');
    const emptySub = empty.querySelector('p:nth-of-type(2)');
    list.innerHTML = '';

    if (currentFollowupItems.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.style.display = 'flex';

        // Debug Context for User
        if (totalScanned > 0) {
            emptyTitle.innerText = "No Follow-ups Found";
            emptySub.innerText = `Scanned ${totalScanned} conversations. AI didn't find any opportunities.`;
        } else {
            emptyTitle.innerText = "No Data Found";
            emptySub.innerText = "Click the Sync button (arrows) to scan LinkedIn.";
        }
        return;
    }

    list.classList.remove('hidden');
    empty.classList.add('hidden');
    empty.style.display = 'none';

    // Render List
    currentFollowupItems.forEach(item => {
        const card = createCard(item);
        card.style.marginBottom = "10px"; // Spacing between cards
        list.appendChild(card);
    });
}

function renderProfileViewsList() {
    const list = document.getElementById('profile-views-list');
    const empty = document.getElementById('empty-state-profile-views');
    list.innerHTML = '';

    if (currentProfileViews.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.style.display = 'flex';
        return;
    }

    list.classList.remove('hidden');
    empty.classList.add('hidden');
    empty.style.display = 'none';

    currentProfileViews.forEach(view => {
        const div = document.createElement('div');
        div.className = 'glass-panel card-padding'; // Reusing existing card styles
        div.style.marginBottom = '12px';

        const initials = getInitials(view.name);
        const relativeTime = view.timeStr || "Recently";

        // AI Hook
        const aiMsg = view.aiMessage || (view.aiStatus === 'pending' ? "Generating hook..." : "No hook generated.");
        const isPending = view.aiStatus === 'pending';

        div.innerHTML = `
            <div style="display:flex; gap:12px; align-items:start;">
                <div class="avatar">${initials}</div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <h3 style="font-weight:600; font-size:0.9rem;">${view.name}</h3>
                        <span style="font-size:0.75rem; color:#64748b;">${relativeTime}</span>
                    </div>
                    <p style="font-size:0.8rem; color:#475569; margin-bottom:8px;" class="truncate">${view.headline}</p>
                    
                    <div style="background:#f1f5f9; padding:8px; border-radius:6px; margin-bottom:8px;">
                        <p style="font-size:0.85rem; color:#334155; font-style:italic;">
                            ${isPending ? `<span class="loading-dots">Analyzing...</span>` : `"${aiMsg}"`}
                        </p>
                    </div>

                    <div style="display:flex; gap:8px;">
                         ${!isPending && view.aiMessage ? `
                         <button class="btn-secondary copy-pv-btn" data-msg="${encodeURIComponent(view.aiMessage)}" style="padding:4px 8px; font-size:0.75rem;">
                            Copy
                         </button>` : ''}
                         
                         <a href="${view.url}" target="_blank" class="btn-primary" style="padding:4px 12px; font-size:0.75rem; text-decoration:none;">
                            View Profile
                         </a>
                    </div>
                </div>
            </div>
        `;

        if (!isPending && view.aiMessage) {
            div.querySelector('.copy-pv-btn').addEventListener('click', (e) => {
                const msg = decodeURIComponent(e.target.getAttribute('data-msg'));
                navigator.clipboard.writeText(msg);
                e.target.innerText = "Copied!";
                setTimeout(() => e.target.innerText = "Copy", 1500);
            });
        }

        list.appendChild(div);
    });
}



function createCard(data) {
    const div = document.createElement('div');
    div.className = 'card';
    div.style.position = 'relative';

    // Normalize Data
    const id = data.id;
    const name = data.name || "Unknown";
    // User Request: Show SUGGESTED message, not just last message
    const suggestion = data.sampleMessage || data.aiSampleMessage;
    const lastMsg = data.message || data.lastMessage || '...';

    // Display Logic: If suggestion exists, show that. Else show last message.
    const displayMessage = suggestion ? suggestion : lastMsg;
    const isSuggestion = !!suggestion;

    // User Request: Dont cut the sample response message short, show full message
    // We display the full message now. CSS will handle wrapping.
    const messageText = displayMessage;

    const category = data.category || data.aiCategory || 'Follow-up';
    const reason = data.reason || data.aiReason || 'AI Reason unavailable';
    const url = data.url || "https://www.linkedin.com/messaging/";
    const tagClass = getCategoryColor(category);
    const initials = getInitials(name);

    div.innerHTML = `
        <div class="card-row" style="display: flex; gap: 12px; align-items: flex-start;">
            <!-- LEFT: Avatar -->
            <div class="avatar" style="flex-shrink: 0;">${initials}</div>

            <!-- RIGHT: Content -->
            <div class="card-content" style="flex: 1; min-width: 0;">
                
                <!-- ROW 1: Name + Actions -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                    <h3 class="card-title truncate" style="margin: 0; font-size: 0.95rem; line-height: 1.2;">${name}</h3>
                    
                    <div class="action-icons" style="display: flex; gap: 8px; align-items: center;">
                        <!-- Info Icon (Reason) -->
                         <div class="tooltip-container">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="text-gray-500 hover:text-blue-600 cursor-help">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span class="tooltip-text">${reason}</span>
                        </div>

                        <!-- Reminder Icon -->
                        <button class="icon-btn remind-trigger" title="Set Reminder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                               <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </button>

                        <!-- Mark Done Icon -->
                        <button class="icon-btn dismiss-btn" title="Mark as Done" style="color: #10b981;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- ROW 2: Message (Suggestion) + Copy -->
                <div style="background: #f8fafc; border-radius: 6px; padding: 8px; margin-bottom: 8px; border: 1px solid #f1f5f9;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <p class="message-preview" style="margin: 0; flex: 1; font-size: 0.85rem; color: #334155; font-style: ${isSuggestion ? 'italic' : 'normal'};">
                            "${messageText}"
                        </p>
                        ${isSuggestion ? `
                        <button class="icon-btn copy-btn" data-message="${encodeURIComponent(suggestion)}" title="Copy Suggested Response" style="flex-shrink: 0; background: white; border: 1px solid #e2e8f0; padding: 4px; border-radius: 4px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                        </button>` : ''}
                    </div>
                </div>

                <!-- ROW 3: Tag + Open Chat -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="badge ${tagClass}">${category}</span>
                    
                    <a href="#" data-url="${url}" class="chat-link-btn btn-secondary" style="font-size: 0.75rem; padding: 4px 10px; background: white; border-color: #e2e8f0;">
                        Open Chat
                    </a>
                </div>
            </div>
        </div>
    `;

    // -- Reminder Form Injection --
    const formId = `rem-form-${id}`;
    const remForm = document.createElement('div');
    remForm.id = formId;
    remForm.className = "hidden suggestion-box";
    remForm.style.marginTop = "8px";
    remForm.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="text" id="rem-text-${id}" placeholder="Remind me to..." class="form-input">
            <div style="display: flex; gap: 8px;">
                <input type="date" id="rem-date-${id}" class="form-input" style="width: auto; flex: 1;">
                <button id="rem-save-${id}" class="btn-primary" style="width: auto; padding: 6px 12px; font-size: 0.8rem;">
                    Save
                </button>
            </div>
        </div>
    `;
    div.appendChild(remForm); // Append at bottom

    // Event Listeners
    // 1. Reminder Toggle
    const remBtn = div.querySelector('.remind-trigger');
    if (remBtn) {
        remBtn.onclick = (e) => {
            e.stopPropagation();
            toggleReminderForm(id);
        };
    }

    // 2. Reminder Save
    setTimeout(() => {
        const saveBtn = document.getElementById(`rem-save-${id}`);
        if (saveBtn) {
            saveBtn.onclick = async () => {
                const text = document.getElementById(`rem-text-${id}`).value;
                const dateVal = document.getElementById(`rem-date-${id}`).value;
                if (!text) return;

                let dueDate = null;
                if (dateVal) {
                    dueDate = new Date(dateVal + 'T12:00:00').getTime();
                }

                const payload = {
                    id: crypto.randomUUID(),
                    conversationId: id,
                    text: text,
                    dueDate: dueDate,
                    createdDate: Date.now(),
                    source: 'user',
                    status: 'pending'
                };

                await chrome.runtime.sendMessage({ type: 'ADD_REMINDER', data: payload });
                window.location.reload();
            };
        }
    }, 0);

    // 3. Dismiss
    const dismissBtn = div.querySelector('.dismiss-btn');
    if (dismissBtn) dismissBtn.addEventListener('click', () => markAsDone(id, div));

    // 4. Chat Link
    const chatLink = div.querySelector('.chat-link-btn');
    if (chatLink) {
        chatLink.addEventListener('click', (e) => {
            e.preventDefault();
            const originalContent = chatLink.innerHTML;
            chatLink.innerHTML = `<span>...</span>`;
            chatLink.disabled = true;

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    const tab = tabs[0];
                    const isLinkedIn = tab.url && tab.url.includes("linkedin.com/messaging");

                    if (isLinkedIn) {
                        const payload = { type: "NAVIGATE_TO_CHAT", url: url, name: name };
                        chrome.tabs.sendMessage(tab.id, payload, (response) => {
                            setTimeout(() => {
                                chatLink.innerHTML = originalContent;
                                chatLink.disabled = false;
                            }, 500);
                            // Fallback if message fails is handled by user clicking again or just nav
                            if (chrome.runtime.lastError || !response || !response.success) {
                                chrome.tabs.update(tab.id, { url: url });
                            }
                        });
                    } else {
                        chrome.tabs.update(tab.id, { url: url });
                        // window.close();
                    }
                }
            });
        });
    }

    // 5. Copy
    const copyBtn = div.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const msg = decodeURIComponent(copyBtn.getAttribute('data-message'));
            navigator.clipboard.writeText(msg).then(() => {
                // Visual feedback
                const svg = copyBtn.innerHTML;
                copyBtn.innerHTML = `<span style="font-size:10px; color:green; font-weight:bold;">✓</span>`;
                setTimeout(() => { copyBtn.innerHTML = svg; }, 1000);
            });
        });
    }

    return div;
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ').filter(part => part.length > 0);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toggleReminderForm(id) {
    const el = document.getElementById(`rem-form-${id}`);
    if (el) {
        el.classList.toggle('hidden');
    }
}

function getCategoryColor(category) {
    if (!category) return 'bg-gray-100 text-gray-800';
    const lower = category.toLowerCase();
    if (lower.includes('recruiter') || lower.includes('hiring')) return 'bg-blue-100 text-blue-800';
    if (lower.includes('cold')) return 'bg-purple-100 text-purple-800';
    if (lower.includes('lead') || lower.includes('opportunity')) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
}

async function markAsDone(id, element) {
    // Send message to background to dismiss the CONVERSATION
    chrome.runtime.sendMessage({ type: 'DISMISS_CONVERSATION', id: id }, (response) => {
        if (response && response.success) {
            // We need to refresh the carousel if in carousel mode
            if (typeof renderCarousel === 'function') {
                // Remove from memory
                currentFollowupItems = currentFollowupItems.filter(i => i.id !== id);
                renderCarousel();
            } else {
                element.remove();
            }
        }
    });
}

function toggleAnalysisLoader(show) {
    const syncBtn = document.getElementById('sync-btn');
    const headerTitle = document.querySelector('h1.text-lg');

    // Existing Loader check
    let loader = document.getElementById('analysis-loader');

    if (show) {
        if (!loader && headerTitle) {
            loader = document.createElement('span');
            loader.id = 'analysis-loader';
            loader.className = 'text-xs text-blue-600 ml-2';
            loader.style.fontWeight = 'normal';
            loader.innerHTML = `Analyzing <span class="loading-dots">...</span>`;

            // Add simple CSS for dots if needed, or just text
            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; } }
                .loading-dots span { animation-name: blink; animation-duration: 1.4s; animation-iteration-count: infinite; animation-fill-mode: both; }
                .loading-dots span:nth-child(2) { animation-delay: .2s; }
                .loading-dots span:nth-child(3) { animation-delay: .4s; }
            `;
            if (!document.getElementById('loader-style')) {
                style.id = 'loader-style';
                document.head.appendChild(style);
            }

            // Rebuild innerHTML with spans
            loader.innerHTML = `Analyzing<span style="font-size: 1.1em;">.</span><span style="font-size: 1.1em; animation-delay: 0.2s;">.</span><span style="font-size: 1.1em; animation-delay: 0.4s;">.</span>`;

            headerTitle.appendChild(loader);
        }

        // Also spin the sync button
        if (syncBtn) {
            const icon = syncBtn.querySelector('svg');
            if (icon) icon.classList.add('spin-anim');
        }

    } else {
        if (loader) loader.remove();
        if (syncBtn) {
            const icon = syncBtn.querySelector('svg');
            if (icon) icon.classList.remove('spin-anim');
        }
    }
}

// --- Settings Logic ---
const settingsBtn = document.getElementById('settings-btn');
const settingsBackBtn = document.getElementById('settings-back-btn');
const settingsView = document.getElementById('view-settings');
const tabsContainer = document.querySelector('.tabs'); // To hide tabs when in settings

// 1. Open Settings
if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
        // Hide main views
        document.getElementById('view-followups').classList.add('hidden');
        document.getElementById('view-reminders').classList.add('hidden');
        tabsContainer.classList.add('hidden'); // Hide the tab bar

        // Show Settings
        settingsView.classList.remove('hidden');

        // Load saved values
        const data = await chrome.storage.local.get(['apiKey', 'aiProvider', 'autoScan', 'syncDays', 'analysisThreshold']);
        if (document.getElementById('setting-api-key')) {
            document.getElementById('setting-api-key').value = data.apiKey || '';
        }
        if (document.getElementById('setting-provider')) {
            document.getElementById('setting-provider').value = data.aiProvider || 'openai';
        }
        if (document.getElementById('setting-provider')) {
            document.getElementById('setting-provider').value = data.aiProvider || 'openai';
        }
        // New Settings
        if (document.getElementById('setting-sync-days')) {
            document.getElementById('setting-sync-days').value = data.syncDays || 30;
        }
        if (document.getElementById('setting-analysis-interval')) {
            document.getElementById('setting-analysis-interval').value = data.analysisThreshold || 24;
        }
    });
}

// 2. Close Settings (Back)
if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', () => {
        settingsView.classList.add('hidden');
        tabsContainer.classList.remove('hidden');

        // Return to whatever tab is active
        const isFollowupsActive = document.getElementById('tab-followups').classList.contains('active');
        if (isFollowupsActive) {
            document.getElementById('view-followups').classList.remove('hidden');
        } else {
            document.getElementById('view-reminders').classList.remove('hidden');
        }
    });
}

// 3. Save Settings
const saveBtn = document.getElementById('save-settings-btn');
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const apiKey = document.getElementById('setting-api-key').value;
        const provider = document.getElementById('setting-provider').value;

        // Validation: Sync Days (Max 60)
        let syncDays = parseInt(document.getElementById('setting-sync-days').value) || 30;
        if (syncDays > 60) syncDays = 60;
        if (syncDays < 1) syncDays = 1;
        // Update input to reflect capped value if needed
        document.getElementById('setting-sync-days').value = syncDays;

        let analysisThreshold = parseInt(document.getElementById('setting-analysis-interval').value) || 24;
        if (analysisThreshold < 1) analysisThreshold = 1;

        await chrome.storage.local.set({
            apiKey,
            aiProvider: provider,
            syncDays,
            analysisThreshold
        });

        // Show feedback
        const status = document.getElementById('save-status');
        status.classList.remove('hidden');
        setTimeout(() => status.classList.add('hidden'), 2000);

        // Optional: Notify background script if it needs to update immediately
        chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
    });
}

// 4. Force Analysis Button
const forceAnalysisBtn = document.getElementById('btn-force-analysis');
if (forceAnalysisBtn) {
    forceAnalysisBtn.addEventListener('click', async () => {
        // Visual feedback
        const originalText = forceAnalysisBtn.innerText;
        forceAnalysisBtn.innerText = "Running...";
        forceAnalysisBtn.disabled = true;

        try {
            await chrome.runtime.sendMessage({ type: "SCAN_COMPLETED" });

            // Wait a moment for visual feedback
            await new Promise(r => setTimeout(r, 1000));
            forceAnalysisBtn.innerText = "Started!";

            setTimeout(() => {
                forceAnalysisBtn.innerText = originalText;
                forceAnalysisBtn.disabled = false;
            }, 2000);
        } catch (e) {
            console.error(e);
            forceAnalysisBtn.innerText = "Error";
            setTimeout(() => {
                forceAnalysisBtn.innerText = originalText;
                forceAnalysisBtn.disabled = false;
            }, 2000);
        }
    });
}