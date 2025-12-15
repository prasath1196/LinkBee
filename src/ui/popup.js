import { aiService } from '../utils/ai_service.js';

// Logic
document.addEventListener('DOMContentLoaded', init);

// Tabs
const tabFollowups = document.getElementById('tab-followups');
const tabReminders = document.getElementById('tab-reminders');
const viewFollowups = document.getElementById('view-followups');
const viewReminders = document.getElementById('view-reminders');

// Carousel State
let currentCardIndex = 0;
let currentFollowupItems = [];

if (tabFollowups && tabReminders) {
    tabFollowups.addEventListener('click', () => switchTab('followups'));
    tabReminders.addEventListener('click', () => switchTab('reminders'));
}

function switchTab(tab) {
    if (tab === 'followups') {
        tabFollowups.classList.add('active');
        tabFollowups.style.color = '#2563eb';
        tabFollowups.style.borderBottomColor = '#2563eb';

        tabReminders.classList.remove('active');
        tabReminders.style.color = '#9ca3af';
        tabReminders.style.borderBottomColor = 'transparent';

        viewFollowups.classList.remove('hidden');
        viewReminders.classList.add('hidden');
    } else {
        tabReminders.classList.add('active');
        tabReminders.style.color = '#2563eb';
        tabReminders.style.borderBottomColor = '#2563eb';

        tabFollowups.classList.remove('active');
        tabFollowups.style.color = '#9ca3af';
        tabFollowups.style.borderBottomColor = 'transparent';

        viewReminders.classList.remove('hidden');
        viewFollowups.classList.add('hidden');
    }
}

async function init() {
    // Check for updates
    chrome.storage.local.get(['needsReload'], (data) => {
        if (data.needsReload) {
            chrome.runtime.sendMessage({ type: "ACK_RELOAD" });
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

    switchTab('followups'); // Default
    await loadData();
}

async function loadData() {
    const data = await chrome.storage.local.get(['conversations', 'reminders']);
    const convs = data.conversations || {};
    const totalScanned = Object.keys(convs).length;
    const notifications = data.notifications || {};
    const totalNotifications = Object.keys(notifications).length;

    // --- 1. Follow-ups (AI Opportunities) ---
    // Include YES decisions AND Pending (no decision yet but active)
    const followups = Object.values(notifications)
        .filter(c => {
            if (c.status === 'done' || c.status === 'dismissed') return false;
            // Show if AI said YES
            if (c.aiDecision === 'YES') return true;
            // ALSO show if AI hasn't run yet but it looks like a candidate (I sent last)
            if (!c.aiDecision && c.lastSenderIsMe) return true;
            return false;
        })
        .sort((a, b) => {
            // Prioritize YES over Pending
            const aScore = a.aiDecision === 'YES' ? 2 : 1;
            const bScore = b.aiDecision === 'YES' ? 2 : 1;
            if (aScore !== bScore) return bScore - aScore;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

    currentFollowupItems = followups;
    renderFollowupsList(totalScanned); // Render List

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

    // Sort by Due Date Ascending (Soonest first)
    allReminders.sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
    renderReminders(allReminders);
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

function renderReminders(items) {
    const list = document.getElementById('reminder-list');
    const empty = document.getElementById('empty-state-reminders');
    list.innerHTML = '';

    if (items.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.style.display = 'flex';
        return;
    }

    list.classList.remove('hidden');
    empty.classList.add('hidden');
    empty.style.display = 'none';

    items.forEach(r => {
        const el = document.createElement('div');
        el.className = 'card-padding glass-panel';
        el.style.marginBottom = '12px';

        const dateStr = r.dueDate ? new Date(r.dueDate).toLocaleDateString() : 'No date';

        el.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h3 style="font-weight: 600; font-size: 0.9rem;">${r.conversationName || 'Unknown'}</h3>
                    <p class="text-xs text-gray-500 mb-2">Due: ${dateStr}</p>
                    <p style="font-size: 0.9rem;">🔔 ${r.text}</p>
                </div>
                <button class="dismiss-rem-btn icon-btn" title="Mark Done" style="color: #10b981;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            </div>
            <div style="margin-top: 8px;">
                 <a href="#" data-url="https://www.linkedin.com/messaging/thread/${r.conversationId}/" class="chat-link-btn btn-secondary" style="display: block; text-align: center; font-size: 0.8rem; padding: 4px;">    
                    Go to Chat
                </a>
            </div>
        `;

        // Attach listeners
        el.querySelector('.dismiss-rem-btn').onclick = async () => {
            await dismissReminder(r.conversationId, r.id, el);
        };

        // Chat Link Logic (Reuse)
        const chatLink = el.querySelector('.chat-link-btn');
        chatLink.addEventListener('click', (e) => {
            e.preventDefault();
            const url = `https://www.linkedin.com/messaging/thread/${r.conversationId}/`;
            chrome.tabs.update({ url: url });
        });

        list.appendChild(el);
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
                        window.close();
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
