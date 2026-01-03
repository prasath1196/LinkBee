import { getConversationId, updateConversationHistory } from './utils_background.js';
import { analyzeConversation } from './analyze_conversations.js';
import { calculateBadge } from './badge_manager.js';
import { generateHistoryHash } from '../utils/hash.js';
import { typedStorage } from '../services/storage.js';

export async function handleNewConversation(data, sendResponse) {
    console.log("LinkBee: [BACKGROUND] Received Data", data);

    // --- API NORMALIZATION START ---
    const myProfile = await typedStorage.getUserProfile();
    const myName = myProfile?.name;

    let {
        text, sender, isMe, timestamp, conversationName,
        history, url, urn, senderUrn, title, isSponsored,
        participants, threadUrn // Parse threadUrn directly if available
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

    // 4. Extract Metadata from Participants (Headline, Distance, Image)
    let headline = "";
    let distance = "";
    let imgUrl = "";
    let isPremium = false;

    if (participants && participants.length > 0) {
        // Find the partner (Filter out Me)
        // 1. Try to find someone who is NOT me (name check or distance check)
        let partner = participants.find(p => p.name !== myName && p.distance !== "SELF" && p.distance !== "You");

        // 2. Fallback: If no other found (e.g. self-chat?), take the first one, but be careful.
        // Actually, if it's just me, we shouldn't overwrite the conversation metadata with 'Me' data if it already has 'Other' data.
        if (!partner && participants.length > 0) {
            // It's possible the array only contains 'Me'. In that case, do NOT set partner metadata.
            // However, if it's a new conversation, we might need something.
            // Let's check if the first one is me.
            const first = participants[0];
            if (first.name !== myName && first.distance !== "SELF") {
                partner = first;
            }
        }

        if (partner) {
            headline = partner.headline || "";
            distance = partner.distance || "";
            // imgUrl extraction can be enhanced later if content.js sends it.
            if (partner.imgUrl) imgUrl = partner.imgUrl;
            if (partner.isPremium) isPremium = true;
        }
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

    // Fetch Strong Typed Data
    const conversations = await typedStorage.getConversations();

    // --- ID CONSOLIDATION STRATEGY ---
    // If the incoming ID is a Thread URN (e.g. 2-Njg...), checking if we already have this conversation 
    // stored under a legacy Profile Key (ACoAA...).

    let consolidatedId = conversationId;

    // Check if ID is a Thread ID (starts with 2- or urn:li:messagingThread)
    const isThreadId = conversationId.startsWith("2-") || conversationId.includes("messagingThread");
    // Check if direct match exists in array
    const hasDirectMatch = conversations.some(c => c.id === conversationId);

    if (isThreadId && !hasDirectMatch) {
        // Only valid if we DON'T have a direct entry for this Thread ID yet.
        // Try to find a legacy entry that matches.

        // Extract Short ID (e.g., 2-AbCd...) from urn:li:messagingThread:2-AbCd...
        let shortId = conversationId;
        const shortMatch = conversationId.match(/messagingThread:(.*)/);
        if (shortMatch) {
            shortId = shortMatch[1];
        }

        const encodedShortId = encodeURIComponent(shortId);
        console.log(`LinkBee: [CONSOLIDATION] Searching for match. ShortID: ${shortId}`);

        // Array-based Find
        const legacyMatch = conversations.find(entry => {
            // Match 1: Entry has explicit 'threadUrn' saved
            if (entry.threadUrn === conversationId) return true;

            // Match 2: Entry URL contains this Thread ID
            if (entry.url) {
                if (entry.url.includes(conversationId)) return true;
                if (entry.url.includes(shortId)) return true;
                if (entry.url.includes(encodedShortId)) return true;
            }

            // Match 3: Entry URN matches
            if (entry.urn === conversationId || entry.urn === urn) return true;

            return false;
        });

        if (legacyMatch) {
            console.log(`LinkBee: [CONSOLIDATION] Mapped Thread ID ${shortId} -> Legacy ID ${legacyMatch.id}`);
            consolidatedId = legacyMatch.id;
        } else {
            console.log(`LinkBee: [CONSOLIDATION] No match found.`);
        }
    }

    // Use the consolidated ID for storage
    const finalId = consolidatedId;

    // 1. INFER NAME FROM HISTORY (If Unknown)
    if (targetName === "Unknown" && history && history.length > 0) {
        const otherMsg = history.slice().reverse().find(m =>
            !m.isMe &&
            m.sender !== "Me" &&
            (!myName || m.sender !== myName)
        );

        if (otherMsg && otherMsg.sender) {
            targetName = otherMsg.sender;
            console.log(`LinkBee: [INFERRED] Name "${targetName}" from history (MyName: ${myName})`);
        }
    }

    // 2. GET EXISTING OR INIT NEW (From Array)
    let existing = conversations.find(c => c.id === finalId);

    if (!existing) {
        existing = {
            id: finalId,
            urn: urn, // Store URN if new
            name: targetName,
            history: [],
            status: 'active',
            // Initialize metadata
            headline: headline,
            networkDistance: distance,
            imgUrl: imgUrl || "",
            isPremium: isPremium,
            isSponsored: isSponsored || false,
            threadUrn: threadUrn || urn // Prefer explicit threadUrn
        };
    }

    // Update Metadata (Smart Merge)
    // 1. Name: Overwrite 'Unknown' but protect real names.
    if (existing.name === "Unknown" && targetName !== "Unknown") existing.name = targetName;
    if (targetName !== "Unknown" && targetName !== "Unknown (Update)" && existing.name === "Unknown (Update)") {
        existing.name = targetName; // Upgrade from Update placeholder
    }

    // 2. Headline: Overwrite if new one is valid
    if (headline && headline.length > 0) existing.headline = headline;

    // 3. Distance: Overwrite if valid
    if (distance && distance.length > 0) existing.networkDistance = distance;

    // 4. Image: Overwrite if valid
    if (imgUrl && imgUrl.length > 0) existing.imgUrl = imgUrl;

    // 5. Premium Status: Trust the latest data
    if (isPremium) existing.isPremium = true;

    // 6. Sponsored Status: Trust the latest data
    if (isSponsored !== undefined) existing.isSponsored = isSponsored;

    // Always update threadUrn if we have it (for future consolidation)
    const bestThreadUrn = threadUrn || urn;
    if (bestThreadUrn && bestThreadUrn !== existing.urn && bestThreadUrn.startsWith("urn:li:messagingThread")) {
        existing.threadUrn = bestThreadUrn;
    }

    // URL STORAGE LOGIC (User Request)
    if (url && url.includes("/messaging/")) {
        existing.url = url;
    }
    else if (existing.url && existing.url.includes("/messaging/")) {
        // No-op: Keep the high-quality link we already have.
    }
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

    // 3. PERSIST STATE (Atomic Save)
    await typedStorage.saveConversation(existing);
    console.log("LinkBee: [SAVED] Initial data persisted for", finalId);

    // Send success response immediately
    if (sendResponse) sendResponse({ success: true, id: finalId });

    // 4. TRIGGER ANALYSIS (Deferred)
    // Only analyze if history has likely changed or it's a new conversation
    // Fetch Settings for Analysis
    const settings = await typedStorage.getSettings();
    if (settings.apiKey) {
        console.log("LinkBee: [TRIGGER] Triggering analysis for", finalId);
        // Run analysis asynchronously (don't await)
        analyzeConversation(
            existing,
            settings.apiKey,
            settings.aiProvider || 'gemini', // Fix: Use aiProvider from schema
            settings.followUpThreshold || 0
        ).catch(err => console.error("LinkBee: Analysis trigger failed", err));
    } else {
        console.log("LinkBee: [SKIP] Analysis skipped (No API Key)");
    }
    calculateBadge();
}
