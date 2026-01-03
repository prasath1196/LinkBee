import { typedStorage } from '../services/storage.js';

export async function calculateBadge() {
    const notifications = await typedStorage.getNotifications();
    updateBadge(notifications.length);
}

function updateBadge(count) {
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: 'red' });
}
