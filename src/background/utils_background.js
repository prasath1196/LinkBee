
export function getConversationId(url, name, sender, urn) {
    // 0. URN (Highest Priority for Cross-Page Mapping)
    if (urn) {
        return urn;
    }

    // 1. Thread ID from URL
    if (url && url.includes("/thread/")) {
        const match = url.match(/thread\/([^/?#&]+)/);
        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }
    }
    // 2. Name Fallback
    const target = name || sender || "Unknown";
    return target.replace(/\s+/g, '_').toLowerCase();
}

export function updateConversationHistory(existing, newHistory, currentText) {
    let changed = false;

    // Check last message consistency (Visual Check)
    if (existing.lastMessage !== currentText) changed = true;

    if (!newHistory || newHistory.length === 0) return changed;

    // 1. Merge Arrays
    const combined = [...(existing.history || []), ...newHistory];

    // 2. Deduplicate (Composite Key: Timestamp + Sender + Text)
    const seen = new Set();
    const unique = [];

    // Process from newest to oldest to safely keep best versions if needed, 
    // but here we just want unique set.
    for (const item of combined) {
        // Create a unique key. 
        // Note: Timestamps might slightly vary if parsed differently, but usually stable from API.
        const key = `${item.timestamp}_${item.sender}_${item.text.slice(0, 50)}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }

    // 3. Sort by Timestamp (Ascending: Old -> New)
    unique.sort((a, b) => a.timestamp - b.timestamp);

    // 4. Limit Size (Keep last 50 for context, user asked for 10 but more is safer for AI)
    const MAX_HISTORY = 50;
    const trimmed = unique.slice(-MAX_HISTORY);

    // 5. Detect Change
    if (trimmed.length !== (existing.history || []).length) {
        changed = true;
    } else {
        // Deep check for content mismatch if lengths match
        const oldJson = JSON.stringify(existing.history);
        const newJson = JSON.stringify(trimmed);
        if (oldJson !== newJson) changed = true;
    }

    existing.history = trimmed;

    return changed;
}
