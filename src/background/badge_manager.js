
export async function calculateBadge() {
    const store = await chrome.storage.local.get(['notifications']);
    const notifications = store.notifications || [];
    updateBadge(notifications.length);
}

function updateBadge(count) {
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: 'red' });
}
