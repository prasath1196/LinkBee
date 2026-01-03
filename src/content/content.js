import { SELECTORS, APP_CONSTANTS } from '../utils/constants.js';
import apiObserverUrl from './api_observer.js?script';

console.log("LinkBee: Content script loaded");

function injectObserver() {
    const script = document.createElement('script');
    // Ensure we use the full chrome-extension:// URL to satisfy LinkedIn's CSP
    const scriptUrl = apiObserverUrl.startsWith('chrome-extension')
        ? apiObserverUrl
        : chrome.runtime.getURL(apiObserverUrl);

    script.src = scriptUrl;
    script.onload = function () {
        this.remove(); // Clean up after injection
        console.log("LinkBee: Injected api_observer.js");
    };
    (document.head || document.documentElement).appendChild(script);
}

function init() {
    // -1. Inject Observer
    injectObserver();
}

// LinkBee Content Script - The "Dumb Pipe"
// Function: Relays API events from api_observer.js (Page Context) to Background Service Worker

// 1. Listen for data from the injected script (api_observer.js)
window.addEventListener('LinkBee_Inbound_API', (e) => {
    // console.log("LinkBee: [CONTENT] Received Event", e.detail);

    const { url, response } = e.detail;

    // Filter: Check for messaging specific endpoints
    if (url.includes('/voyager/api/messaging/conversations') ||
        url.includes('messengerMessages') ||
        url.includes('voyagerMessagingGraphQL')) {

        // A. Identify "My Name" from DOM (Best Effort)
        // The background script can't access the DOM, so we grab it here if possible.
        // This helps resolve "Who matches 'You'?" in 1:1 chat logic backend.
        const myName = document.querySelector(".global-nav__me-photo")?.alt?.trim();

        // B. Determine API Type (Optional Hint)
        let apiType = "UNKNOWN";
        if (url.includes("messengerMessages")) apiType = "CHAT_OPENED";
        if (url.includes("messengerConversations")) apiType = "SIDEBAR_SCROLL";

        // C. Forward to Background
        // We send the RAW data. The background script now handles all the parsing logic.
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: "RAW_API_PAYLOAD",
                apiType: apiType,
                data: response,
                currentUser: myName
            }, (res) => {
                if (chrome.runtime.lastError) {
                    // Suppress "Receiving end does not exist" harmless errors during reload
                }
            });
        } else {
            console.warn("LinkBee: Extension context invalidated. Please reload page.");
        }
    }
});

// Note: All previous parsing logic (transformApiData, resolveConversationKey) 
// has been moved to src/background/api_parser.js

// Boot
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}