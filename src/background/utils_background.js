
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

    // Check last message consistency
    if (existing.lastMessage !== currentText) changed = true;

    // Check array content
    if (newHistory && newHistory.length > 0) {
        if (!existing.history || existing.history.length !== newHistory.length) {
            changed = true;
        } else {
            const lastNew = newHistory[newHistory.length - 1];
            const lastOld = existing.history[existing.history.length - 1];
            if (lastNew?.text !== lastOld?.text) changed = true;
        }
        existing.history = newHistory;
    }

    return changed;
}
