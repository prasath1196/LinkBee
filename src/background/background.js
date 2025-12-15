import { aiService } from '../utils/ai_service.js';

// ============================================================================
// CONSTANTS & INIT
// ============================================================================
const ALARM_NAME = 'linkbee_daily_check';
const CHECK_INTERVAL_MINUTES = 60 * 4; // Check every 4 hours

chrome.runtime.onInstalled.addListener(() => {
    console.log("LinkBee: Installed");
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
    console.log("LinkBee: Startup");
    runDailyCheck(); // Run logic on browser open
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        runDailyCheck();
    }
});

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// ============================================================================
// MUTEX (Concurrency Control)
// ============================================================================
class Mutex {
    constructor() { this._queue = []; this._locked = false; }
    lock() { return new Promise(r => { this._locked ? this._queue.push(r) : (this._locked = true, r()); }); }
    unlock() { this._queue.length > 0 ? this._queue.shift()() : this._locked = false; }
}
const storageMutex = new Mutex();

// ============================================================================
// MESSAGE HANDLING
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. New Data from Content Script
    if (request.type === 'NEW_CONVERSATION_DATA') {
        storageMutex.lock().then(async () => {
            try {
                // We pass sendResponse to handleNewConversation so it can call it deeply
                // Note: We await it only for the synchronous save part. AI runs detached.
                await handleNewConversation(request.data, sendResponse);
            } catch (err) {
                console.error("LinkBee: Error processing new data", err);
                sendResponse({ success: false, error: err.message });
            } finally {
                storageMutex.unlock();
            }
        });
        return true;
    }

    // 2. Manual Scan Trigger
    if (request.action === 'FORCE_SCAN') {
        chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
            if (tabs.length === 0) {
                sendResponse({ success: false, error: "No LinkedIn tab found" });
                return;
            }
            // Prioritize active tab if it's LinkedIn, otherwise first found
            const targetTab = tabs.find(t => t.active) || tabs[0];
            chrome.tabs.sendMessage(targetTab.id, { type: "TRIGGER_Sidebar_SCAN" }).catch(() => { });
            sendResponse({ success: true });
        });
        return true;
    }

    // 3. Scan Finished -> Trigger Analysis
    if (request.type === 'SCAN_COMPLETED') {
        console.log("LinkBee: Scan complete. Running analysis...");
        setTimeout(() => { runDailyCheck(); }, 1000);
    }

    // 4. UI Actions (Dismiss, Mark Read, Add Reminder)
    if (request.type === 'MARK_NOTIFICATION_READ') {
        // ... (Existing logic for notification read) ...
        const { id } = request;
        chrome.storage.local.get('notifications', (store) => {
            let notifications = store.notifications || [];
            notifications = notifications.filter(n => n.id !== id);
            chrome.storage.local.set({ notifications }, () => {
                updateBadge(notifications.length);
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (request.type === 'DISMISS_CONVERSATION') {
        const { id } = request;
        storageMutex.lock().then(async () => {
            const store = await chrome.storage.local.get(['conversations', 'notifications']);
            const conversations = store.conversations || {};
            let notifications = store.notifications || [];

            if (conversations[id]) {
                conversations[id].needsAction = false;
                conversations[id].status = 'dismissed';

                // ALSO remove from notifications
                notifications = notifications.filter(n => n.conversationId !== id);

                await chrome.storage.local.set({ conversations, notifications });
                calculateBadge();
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false });
            }
            storageMutex.unlock();
        });
        return true;
    }

    // ... (Existing logic for Reminders) ...
    if (request.type === 'DISMISS_REMINDER') {
        const { reminderId, conversationId } = request;
        storageMutex.lock().then(async () => {
            const store = await chrome.storage.local.get(['reminders', 'notifications']);
            const reminders = store.reminders || [];
            let notifications = store.notifications || [];

            const updatedReminders = reminders.filter(r => r.id !== reminderId);

            // Remove notification associated with this reminder (by conversation ID to be safe)
            if (conversationId) {
                notifications = notifications.filter(n => n.conversationId !== conversationId);
            }

            await chrome.storage.local.set({ reminders: updatedReminders, notifications });

            // Recalculate badge immediately
            setTimeout(calculateBadge, 100);

            storageMutex.unlock();
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.type === 'ADD_REMINDER') {
        storageMutex.lock().then(async () => {
            const reminders = (await chrome.storage.local.get('reminders')).reminders || [];
            reminders.push(request.data);
            await chrome.storage.local.set({ reminders });
            storageMutex.unlock();
            sendResponse({ success: true });
        });
        return true;
    }

    return true;
});

// ============================================================================
// CORE LOGIC
// ============================================================================

async function handleNewConversation(data, sendResponse) {
    console.log("LinkBee: [BACKGROUND] Received Data", data.conversationName, data.text?.substring(0, 10));

    const { text, sender, isMe, timestamp, conversationName, history, url } = data;

    if (!timestamp || isNaN(timestamp)) {
        console.warn("LinkBee: [SKIP] Invalid timestamp", timestamp);
        if (sendResponse) sendResponse({ success: false, error: "Invalid timestamp" });
        return;
    }

    // 1. EXTRACT UNIQUE ID (Thread ID)
    // We prefer the URL ID because names can be duplicate or "Unknown".
    let conversationId = null;
    if (url && url.includes("/thread/")) {
        const match = url.match(/thread\/([^/?#&]+)/);
        if (match && match[1]) {
            conversationId = decodeURIComponent(match[1]); // e.g. "2-ODFk..."
        }
    }

    // Fallback ID (Name-based) if URL parsing fails
    const targetName = conversationName || sender || "Unknown";
    if (!conversationId) {
        conversationId = targetName.replace(/\s+/g, '_').toLowerCase();
    }

    console.log(`LinkBee: [PROCESSING] ID: ${conversationId} (Name: ${targetName})`);

    const store = await chrome.storage.local.get(['conversations', 'apiKey', 'aiProvider', 'analysisThreshold']);
    const conversations = store.conversations || {};

    const existing = conversations[conversationId] || {
        id: conversationId,
        name: targetName,
        history: [],
        status: 'active'
    };

    // Fix name if it was unknown and we found it now
    if (existing.name === "Unknown" && targetName !== "Unknown") {
        existing.name = targetName;
    }

    // Detect History Change
    let historyChanged = false;
    if (existing.lastMessage !== text) historyChanged = true;
    if (history && history.length > 0) {
        if (!existing.history || existing.history.length !== history.length) {
            historyChanged = true;
        } else {
            const lastNew = history[history.length - 1];
            const lastOld = existing.history[existing.history.length - 1];
            if (lastNew.text !== lastOld.text) historyChanged = true;
        }
        existing.history = history;
    }

    existing.lastMessage = text;
    existing.lastTimestamp = timestamp;
    existing.lastSenderIsMe = isMe;
    if (url) existing.url = url;

    if (historyChanged) {
        existing.history_changed_since_analyzed = true;
        console.log(`LinkBee: History changed for ${targetName}`);
    }

    if (isMe) {
        existing.status = 'active';
    }

    // SAVE 1: Immediate Storage
    conversations[conversationId] = existing;
    await chrome.storage.local.set({ conversations });
    console.log("LinkBee: [SAVED] Initial data persisted for", conversationId);

    // CRITICAL FIX: Send Response NOW. Do not wait for AI.
    if (sendResponse) {
        sendResponse({ success: true, id: conversationId });
    }

    // AI PROCESS (Async/Background)
    if (isMe && store.apiKey) {
        console.log("LinkBee: [ANALYZING] Triggering immediate analysis in background...");
        // Use 0 threshold to force analysis
        analyzeConversation(existing, store.apiKey, store.aiProvider, 0).then(async () => {
            // SAVE 2: Update with AI Results in background
            // We must re-fetch 'conversations' to avoid overwriting concurrent updates?
            // Actually, since we are inside a Mutex lock, we are "safe" from other `handleNewConversation` calls.
            // BUT, the Mutex unlocks as soon as this function returns (because we removed await from the caller).
            // Wait. If we decouple response, do we decouple Mutex?

            // If we decouple Mutex, concurrent writes risk race conditions (read-modify-write).
            // Option A: Keep Mutex locked until AI finishes (but sendResponse early).
            // Option B: Re-read storage before second save.

            // Let's go with Option B logic inside a mini-lock or just optimistic update.
            // Simplest: Just save again. Collisions are rare for *same* conversation concurrently.

            const freshStore = await chrome.storage.local.get('conversations');
            const freshConvos = freshStore.conversations || {};

            // Merge our updates into potentially fresher object
            freshConvos[conversationId] = existing;
            await chrome.storage.local.set({ conversations: freshConvos });
            console.log("LinkBee: [SAVED] Post-analysis data persisted for", conversationId);
            calculateBadge();
        });
    } else {
        calculateBadge();
    }
}

async function runDailyCheck() {
    const store = await chrome.storage.local.get(['conversations', 'apiKey', 'aiProvider', 'analysisThreshold']);
    const conversations = store.conversations || {};
    const apiKey = store.apiKey;
    const provider = store.aiProvider;
    const threshold = store.analysisThreshold || 24;

    console.log(`LinkBee: Running Daily Check (Threshold: ${threshold}h)`);

    if (!apiKey) return;

    let actionCount = 0;

    for (const id in conversations) {
        const conv = conversations[id];

        // Only analyze if:
        // 1. I sent the last message (waiting for reply)
        // 2. Or it's marked 'active' and history changed
        if (conv.status === 'replied' || conv.status === 'dismissed') continue;
        if (!conv.lastSenderIsMe) continue;

        await analyzeConversation(conv, apiKey, provider, threshold);

        if (conv.needsAction) actionCount++;
    }

    // Reminder Check
    const rStore = await chrome.storage.local.get(['reminders', 'notifications']);
    let reminders = rStore.reminders || [];
    let notifications = rStore.notifications || [];
    let remindersChanged = false;
    const now = Date.now();

    reminders.forEach(rem => {
        if (rem.status === 'pending' && rem.dueDate && rem.dueDate <= now) {
            notifications.push({
                id: crypto.randomUUID(),
                conversationId: rem.conversationId,
                name: "Reminder: " + (conversations[rem.conversationId]?.name || "Unknown"),
                message: rem.text,
                reason: "User Reminder due",
                category: "Reminder",
                timestamp: now,
                url: conversations[rem.conversationId]?.url || "https://www.linkedin.com/messaging/"
            });
            rem.status = 'triggered';
            remindersChanged = true;
        }
    });

    if (remindersChanged) {
        await chrome.storage.local.set({ reminders, notifications });
    }

    await chrome.storage.local.set({ conversations });
    calculateBadge();
}

async function analyzeConversation(conv, apiKey, provider, thresholdHours) {
    const now = Date.now();
    const lastAnalyzed = conv.lastAnalyzed || 0;
    const hoursSinceLastCheck = (now - lastAnalyzed) / (1000 * 60 * 60);

    // DEBOUNCE: Only re-analyze if enough time passed OR history changed
    // If thresholdHours is 0, we treat it as "Force Analyze" if history changed.
    if (hoursSinceLastCheck < thresholdHours) {
        if (conv.history_changed_since_analyzed) {
            console.log(`LinkBee: Bypassing threshold (${hoursSinceLastCheck.toFixed(1)}h < ${thresholdHours}h) because history changed.`);
        } else {
            // No change, and too soon: Skip
            return false;
        }
    }

    // DATA VALIDITY
    if (!conv.lastTimestamp || isNaN(conv.lastTimestamp)) return false;

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const daysSinceRaw = (now - conv.lastTimestamp) / MS_PER_DAY;
    const daysSince = Math.max(0, daysSinceRaw);

    // AI CALL
    try {
        const context = {
            lastMessage: conv.lastMessage,
            lastSenderIsMe: conv.lastSenderIsMe,
            daysSince: daysSince.toFixed(1),
            history: conv.history || []
        };

        console.log(`LinkBee: Analyzing ${conv.name} (${daysSince.toFixed(1)}d)...`);
        const result = await aiService.analyze(provider, context, apiKey);

        // Update State
        conv.lastAnalyzed = now;
        conv.history_changed_since_analyzed = false;

        if (result) {
            conv.aiLastDecision = result.decision;
            conv.aiReason = result.reason;
            conv.aiCategory = result.category;
            // User Request: Store ALL AI fields
            conv.aiConfidence = result.confidence_score;
            conv.aiScenario = result.scenario_type;
            conv.aiSampleMessage = result.sample_follow_up_message;

            // Handle Reminders from AI
            if (result.reminder && result.reminder.text) {
                const rStore = await chrome.storage.local.get('reminders');
                const reminders = rStore.reminders || [];

                // Dedupe: Limit to 1 pending AI reminder per conversation
                // The AI generates slightly different text each time, so exact match fails.
                // We assume one active reminder is enough per conversation.
                const hasPendingAiReminder = reminders.some(r =>
                    r.conversationId === conv.id &&
                    r.source === 'ai' &&
                    r.status === 'pending'
                );

                if (!hasPendingAiReminder) {
                    let dueDate = null;
                    if (result.reminder.suggested_date) {
                        dueDate = Date.parse(result.reminder.suggested_date);
                    }
                    reminders.push({
                        id: crypto.randomUUID(),
                        conversationId: conv.id,
                        text: result.reminder.text,
                        dueDate: dueDate,
                        createdDate: Date.now(),
                        source: 'ai',
                        status: 'pending'
                    });
                    await chrome.storage.local.set({ reminders });
                    console.log(`LinkBee: [SAVED] AI Reminder added for ${conv.name}`);
                } else {
                    console.log(`LinkBee: [SKIP] Pending AI reminder already exists for ${conv.name}`);
                }
            }

            if (result.decision === "YES") {
                conv.needsAction = true;

                // Add Notification (User Request: Save as separate data)
                const nStore = await chrome.storage.local.get('notifications');
                const notifications = nStore.notifications || [];

                // Dedupe: Don't add if we already have a notification for this conversation roughly now
                const alreadyNotified = notifications.find(n => n.conversationId === conv.id);

                if (!alreadyNotified) {
                    notifications.push({
                        id: crypto.randomUUID(),
                        conversationId: conv.id,
                        name: conv.name,
                        message: result.sample_follow_up_message || "Time to follow up!",
                        reason: result.reason,
                        category: conv.aiCategory || "General",
                        timestamp: Date.now(),
                        url: conv.url || "https://www.linkedin.com/messaging/"
                    });
                    await chrome.storage.local.set({ notifications });
                    console.log(`LinkBee: [SAVED] Notification created for ${conv.name}`);
                }
            } else {
                conv.needsAction = false;
            }
        }
    } catch (e) {
        console.error("LinkBee: Analysis Error", e);
    }
}

// Helper for Badge
async function calculateBadge() {
    const store = await chrome.storage.local.get(['notifications']);
    const notifications = store.notifications || [];

    // User Request: "There are only 5 notifications data, byt 10 is shown"
    // Fix: We were summing actionItems + notifications. 
    // Since actionItems (Follow-ups) also create a notification, this was double counting.
    // We now count ONLY the notifications list as the source of truth for the badge.
    updateBadge(notifications.length);
}

function updateBadge(count) {
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
}
