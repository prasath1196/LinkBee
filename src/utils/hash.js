/**
 * Simple string hashing function (DJB2 implementation)
 * Returns a string representation of the hash
 */
export function generateHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16); // Convert to unsigned 32-bit hex string
}

/**
 * Generates a hash for a conversation history array
 * @param {Array} history Array of message objects
 * @returns {string} Hex hash string
 */
export function generateHistoryHash(history) {
    if (!history || !Array.isArray(history)) return "0";

    // Create a stable string representation
    // We only care about the content and sender to detect meaningful changes
    const stableString = history.map(m => `${m.sender}:${m.text}`).join('|');
    return generateHash(stableString);
}
