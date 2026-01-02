import { getConversationId, updateConversationHistory } from './utils_background.js';
import { analyzeConversation } from './analyze_conversations.js';
import { calculateBadge } from './badge_manager.js';
import { generateHistoryHash } from '../utils/hash.js';

export async function handleNewConversation(data, sendResponse) {
    console.log("LinkBee: [BACKGROUND] Received Data", data.title || data.conversationName);

    // --- API NORMALIZATION START ---
    let {
        text, sender, isMe, timestamp, conversationName,
        history, url, urn, senderUrn, title, isSponsored
    } = data;

    // 1. Normalize Title/Name
    conversationName = conversationName || title || "Unknown";
    sender = sender || title || "Unknown"; // API sends title/name in 'title'

    // 2. Infer 'isMe' logic if missing (API uses URNs)
    // We need to compare senderUrn with a stored User URN, or rely on client-side flag.
    // However, the client wrapper didn't set 'isMe'. 
    // Fallback: If senderUrn is missing, or we can't tell, default to FALSE (incoming message).
    if (isMe === undefined && senderUrn) {
        // If we know our own URN, we could check. For now assume NEW messages from API are incoming unless marked otherwise.
        // Wait, 'isMe' is critical. 
        // Let's rely on the scraped data logic: if it's a DELTA event, check the 'from' field?
        // Actually, for now, let's treat all captured messages as 'Them' unless explicitly 'isMe'.
        isMe = false;

        // Better: We can store the user's URN once we see it (e.g. from profile scrape or initial load)
        // But simply, if the name matches "Me" (legacy) or we have a specific flag.
    }

    // 3. Construct History if missing (API sends 'raw' or single items)
    if (!history && data.text) {
        history = [{
            sender: sender,
            text: text,
            timestamp: timestamp,
            isMe: isMe || false,
            dateHeader: new Date(timestamp).toLocaleDateString() // Mock header
        }];
    }
    // --- API NORMALIZATION END ---

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

    // --- ID CONSOLIDATION STRATEGY ---
    // If the incoming ID is a Thread URN (e.g. 2-Njg...), checking if we already have this conversation 
    // stored under a legacy Profile Key (ACoAA...).
    // This handles the case where content.js couldn't resolve the Profile ID (e.g. delta update).

    let consolidatedId = conversationId;

    // Check if ID is a Thread ID (starts with 2- or urn:li:messagingThread)
    const isThreadId = conversationId.startsWith("2-") || conversationId.includes("messagingThread");

    if (isThreadId && !conversations[conversationId]) {
        // Only valid if we DON'T have a direct entry for this Thread ID yet.
        // Try to find a legacy entry that matches.

        const legacyMatch = Object.keys(conversations).find(key => {
            const entry = conversations[key];
            // Match 1: Entry has explicit 'threadUrn' saved
            if (entry.threadUrn === conversationId) return true;

            // Match 2: Entry URL contains this Thread ID
            // Legacy URL format: .../messaging/thread/2-ABC.../
            if (entry.url && entry.url.includes(conversationId)) return true;

            // Match 3: Entry URN matches (unlikely if key differs, but possible)
            if (entry.urn === conversationId || entry.urn === urn) return true;

            return false;
        });

        if (legacyMatch) {
            console.log(`LinkBee: [CONSOLIDATION] Mapped Thread ID ${conversationId} -> Legacy ID ${legacyMatch}`);
            consolidatedId = legacyMatch;
        }
    }

    // Use the consolidated ID for storage
    const finalId = consolidatedId;


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

    // --- MIGRATION LOGIC REPLACED BY CONSOLIDATION ABOVE ---

    const existing = conversations[finalId] || {
        id: finalId,
        urn: urn, // Store URN if new
        name: targetName,
        history: [],
        status: 'active'
    };

    // Update Metadata
    if (existing.name === "Unknown" && targetName !== "Unknown") existing.name = targetName;
    // Always update threadUrn if we have it (for future consolidation)
    if (urn && urn !== existing.urn) existing.threadUrn = urn;

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
        existing.url = `https://www.linkedin.com/in/${finalId}/`;
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
    conversations[finalId] = existing;
    await chrome.storage.local.set({ conversations });
    console.log("LinkBee: [SAVED] Initial data persisted for", finalId);

    // Send success response immediately
    if (sendResponse) sendResponse({ success: true, id: finalId });

    // 4. TRIGGER ANALYSIS (DISABLED: Manual Only per User Request)
    // We strictly save data here. Analysis is now triggered manually via the UI.
    calculateBadge();
}
