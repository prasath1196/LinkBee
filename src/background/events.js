
import { ALARM_NAME, CHECK_INTERVAL_MINUTES, reanalyzeStoredData } from './daily_check.js';
import { handleNewConversation } from './handle_new_conversation.js';
import { calculateBadge } from './badge_manager.js';
import { storageMutex } from './mutex.js';

chrome.runtime.onInstalled.addListener(() => {
    console.log("LinkBee: Installed");
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
    console.log("LinkBee: Startup");
    chrome.storage.local.set({ isAnalyzing: false });
    reanalyzeStoredData();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        reanalyzeStoredData();
    }
});

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// ============================================================================
// MESSAGE DISPATCHER
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 1. DATA INGESTION
    if (request.type === 'NEW_CONVERSATION_DATA') {
        storageMutex.lock().then(async () => {
            try {
                // Background processing, don't await the whole chain for response
                await handleNewConversation(request.data, sendResponse);
            } catch (err) {
                console.error("LinkBee: Error processing new data", err);
                sendResponse({ success: false, error: err.message });
            } finally {
                storageMutex.unlock();
            }
        });
        return true; // Keep channel open
    }

    // 2. TRIGGER ACTIONS
    if (request.action === 'FORCE_SCAN') {
        chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
            if (tabs.length === 0) {
                sendResponse({ success: false, error: "No LinkedIn tab found" });
                return;
            }
            const targetTab = tabs.find(t => t.active) || tabs[0];
            chrome.tabs.sendMessage(targetTab.id, { type: "TRIGGER_Sidebar_SCAN" }).catch(() => { });
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.type === 'SCAN_COMPLETED') {
        console.log("LinkBee: Scan complete. Running analysis...");
        setTimeout(() => { reanalyzeStoredData(); }, 1000);
        // No response needed usually, but good practice
        sendResponse({ success: true });
        return true;
    }

    // 3. UI INTERACTIONS
    if (request.type === 'MARK_NOTIFICATION_READ') {
        const { id } = request;
        chrome.storage.local.get('notifications', (store) => {
            let notifications = store.notifications || [];
            notifications = notifications.filter(n => n.id !== id);
            chrome.storage.local.set({ notifications }, () => {
                calculateBadge();
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

                // Remove associated notification
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

    // 4. REMINDER MANAGEMENT
    if (request.type === 'DISMISS_REMINDER') {
        const { reminderId, conversationId } = request;
        storageMutex.lock().then(async () => {
            const store = await chrome.storage.local.get(['reminders', 'notifications']);
            const reminders = store.reminders || [];
            let notifications = store.notifications || [];

            const updatedReminders = reminders.filter(r => r.id !== reminderId);

            // Remove notification if linked
            if (conversationId) {
                notifications = notifications.filter(n => n.conversationId !== conversationId);
            }

            await chrome.storage.local.set({ reminders: updatedReminders, notifications });
            calculateBadge();
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
