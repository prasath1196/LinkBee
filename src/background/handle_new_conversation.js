
import { getConversationId, updateConversationHistory } from './utils_background.js';
import { analyzeConversation } from './analyze_conversations.js';
import { calculateBadge } from './badge_manager.js';

export async function handleNewConversation(data, sendResponse) {
    console.log("LinkBee: [BACKGROUND] Received Data", data.conversationName, data.text?.substring(0, 10));

    const { text, sender, isMe, timestamp, conversationName, history, url } = data;

    if (!timestamp || isNaN(timestamp)) {
        console.warn("LinkBee: [SKIP] Invalid timestamp", timestamp);
        if (sendResponse) sendResponse({ success: false, error: "Invalid timestamp" });
        return;
    }

    // 1. GENERATE ID
    const conversationId = getConversationId(url, conversationName, sender);
    const targetName = conversationName || sender || "Unknown";

    console.log(`LinkBee: [PROCESSING] ID: ${conversationId} (Name: ${targetName})`);

    const store = await chrome.storage.local.get(['conversations', 'apiKey', 'aiProvider', 'analysisThreshold']);
    const conversations = store.conversations || {};

    const existing = conversations[conversationId] || {
        id: conversationId,
        name: targetName,
        history: [],
        status: 'active'
    };

    // Update Metadata
    if (existing.name === "Unknown" && targetName !== "Unknown") existing.name = targetName;
    if (url) existing.url = url;

    // 2. DETECT & UPDATE HISTORY
    const historyChanged = updateConversationHistory(existing, history, text);

    existing.lastMessage = text;
    existing.lastTimestamp = timestamp;
    existing.lastSenderIsMe = isMe;

    if (historyChanged) {
        existing.history_changed_since_analyzed = true;
        console.log(`LinkBee: History changed for ${targetName}`);
    }

    if (isMe) existing.status = 'active';

    // 3. PERSIST INITIAL STATE
    conversations[conversationId] = existing;
    await chrome.storage.local.set({ conversations });
    console.log("LinkBee: [SAVED] Initial data persisted for", conversationId);

    // Send success response immediately
    if (sendResponse) sendResponse({ success: true, id: conversationId });

    // 4. TRIGGER ANALYSIS (If needed)
    if (isMe && store.apiKey) {
        console.log("LinkBee: [ANALYZING] Triggering immediate analysis...");
        // Force analyze (threshold 0) because user action implies active context
        analyzeConversation(existing, store.apiKey, store.aiProvider, 0).then(async () => {
            // Re-fetch to avoid race conditions with other updates
            const freshStore = await chrome.storage.local.get('conversations');
            const freshConvos = freshStore.conversations || {};
            freshConvos[conversationId] = existing;
            await chrome.storage.local.set({ conversations: freshConvos });
            console.log("LinkBee: [SAVED] Post-analysis data persisted for", conversationId);
            calculateBadge();
        });
    } else {
        calculateBadge();
    }
}
