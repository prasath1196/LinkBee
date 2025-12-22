import { getConversationId, updateConversationHistory } from './utils_background.js';
import { analyzeConversation } from './analyze_conversations.js';
import { calculateBadge } from './badge_manager.js';
import { generateHistoryHash } from '../utils/hash.js';

export async function handleNewConversation(data, sendResponse) {
    console.log("LinkBee: [BACKGROUND] Received Data", data.conversationName, data.text?.substring(0, 10));

    const { text, sender, isMe, timestamp, conversationName, history, url, urn } = data;

    if (!timestamp || isNaN(timestamp)) {
        console.warn("LinkBee: [SKIP] Invalid timestamp", timestamp);
        if (sendResponse) sendResponse({ success: false, error: "Invalid timestamp" });
        return;
    }

    // 1. GENERATE ID (New URN-based)
    const conversationId = getConversationId(url, conversationName, sender, urn);
    let targetName = conversationName || sender || "Unknown";

    console.log(`LinkBee: [PROCESSING] ID: ${conversationId} (Name: ${targetName})`);

    const store = await chrome.storage.local.get(['conversations', 'apiKey', 'aiProvider', 'analysisThreshold', 'userProfile']);
    const conversations = store.conversations || {};
    const myName = store.userProfile?.name;

    // 1. INFER NAME FROM HISTORY (If Unknown)
    if (targetName === "Unknown" && history && history.length > 0) {
        // Find a message from the "other" person
        // Logic: Message not marked isMe, and sender name is not "Me" or my real name
        const otherMsg = history.reverse().find(m =>
            !m.isMe &&
            m.sender !== "Me" &&
            (!myName || m.sender !== myName)
        );

        if (otherMsg && otherMsg.sender) {
            targetName = otherMsg.sender;
            console.log(`LinkBee: [INFERRED] Name "${targetName}" from history (MyName: ${myName})`);
        }
    }

    // --- MIGRATION LOGIC START ---
    // Check if we have data under the OLD ID format (Thread ID / Name) but now have a URN
    if (urn) {
        // Calculate what the ID *would* be without URN
        const legacyId = getConversationId(url, conversationName, sender);

        // If we have data at legacyId BUT NOT at the new urn-based ID, migrate it
        if (conversations[legacyId] && !conversations[conversationId] && legacyId !== conversationId) {
            console.log(`LinkBee: [MIGRATION] Migrating data from ${legacyId} to ${conversationId}`);
            conversations[conversationId] = {
                ...conversations[legacyId],
                id: conversationId,
                urn: urn
            };
            delete conversations[legacyId];

            // Persist immediately to prevent data loss race
            await chrome.storage.local.set({ conversations });
        }
    }
    // --- MIGRATION LOGIC END ---

    const existing = conversations[conversationId] || {
        id: conversationId,
        urn: urn, // Store URN if new
        name: targetName,
        history: [],
        status: 'active'
    };

    // Update Metadata
    if (existing.name === "Unknown" && targetName !== "Unknown") existing.name = targetName;

    // URL STORAGE LOGIC (User Request)
    // 1. If incoming URL has "/messaging/", it is the best source (Thread URL) -> Store it.
    if (url && url.includes("/messaging/")) {
        existing.url = url;
    }
    // 2. If existing URL already has "/messaging/", PRESERVE IT. 
    // (Do not overwrite it with a Notification or Feed URL)
    else if (existing.url && existing.url.includes("/messaging/")) {
        // No-op: Keep the high-quality link we already have.
    }
    // 3. Fallback: If neither has "/messaging/", construct a Profile URL from the ID.
    // This allows opening the User's Profile as a fallback (better than generic feed).
    else {
        existing.url = `https://www.linkedin.com/in/${conversationId}/`;
    }

    // 2. DETECT & UPDATE HISTORY
    const historyChanged = updateConversationHistory(existing, history, text);

    // HASH GENERATION
    existing.currentHash = generateHistoryHash(existing.history);

    existing.lastMessage = text;
    existing.lastTimestamp = timestamp;
    existing.lastSenderIsMe = isMe;

    if (historyChanged) {
        existing.history_changed_since_analyzed = true;
        console.log(`LinkBee: History changed for ${targetName} (Hash: ${existing.currentHash})`);
    }

    if (isMe) existing.status = 'active';

    // 3. PERSIST INITIAL STATE
    conversations[conversationId] = existing;
    await chrome.storage.local.set({ conversations });
    console.log("LinkBee: [SAVED] Initial data persisted for", conversationId);

    // Send success response immediately
    if (sendResponse) sendResponse({ success: true, id: conversationId });

    // 4. TRIGGER ANALYSIS (DISABLED: Manual Only per User Request)
    // We strictly save data here. Analysis is now triggered manually via the UI.
    calculateBadge();
}
