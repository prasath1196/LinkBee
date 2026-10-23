import { localAvailability, localPrompt } from '../utils/nano.js';

// Offscreen document: hosts the Prompt API when the service worker can't.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target !== 'offscreen') return false;

    (async () => {
        try {
            if (request.type === 'NANO_AVAILABILITY') {
                sendResponse({ result: await localAvailability() });
            } else if (request.type === 'NANO_PROMPT') {
                const { systemPrompt, prompt, schema } = request.payload;
                sendResponse({ result: await localPrompt(systemPrompt, prompt, schema) });
            } else {
                sendResponse({ error: `Unknown offscreen request: ${request.type}` });
            }
        } catch (e) {
            sendResponse({ error: e.message || String(e) });
        }
    })();

    return true;
});
