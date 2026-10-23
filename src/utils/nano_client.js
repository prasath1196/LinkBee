import { hasPromptApi, localAvailability, localPrompt } from './nano.js';

/**
 * Service-worker facing Nano client.
 * Uses the Prompt API directly when the service worker exposes it,
 * otherwise proxies through an offscreen document.
 */

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
let creatingOffscreen = null;

async function ensureOffscreen() {
    if (!chrome.offscreen) throw new Error('Offscreen API unavailable');

    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    if (contexts.length > 0) return;

    if (!creatingOffscreen) {
        creatingOffscreen = chrome.offscreen.createDocument({
            url: OFFSCREEN_PATH,
            reasons: [chrome.offscreen.Reason.DOM_PARSER],
            justification: 'Run the on-device Prompt API (Gemini Nano) for conversation analysis.'
        }).finally(() => { creatingOffscreen = null; });
    }
    await creatingOffscreen;
}

async function callOffscreen(type, payload = {}) {
    await ensureOffscreen();
    const response = await chrome.runtime.sendMessage({ target: 'offscreen', type, payload });
    if (!response) throw new Error('No response from offscreen document');
    if (response.error) throw new Error(response.error);
    return response.result;
}

export async function nanoAvailability() {
    if (hasPromptApi()) return localAvailability();
    try {
        return await callOffscreen('NANO_AVAILABILITY');
    } catch (e) {
        console.warn("LinkBee: [Nano] Offscreen availability failed", e);
        return 'unavailable';
    }
}

export async function nanoPrompt(systemPrompt, prompt, schema = null) {
    if (hasPromptApi()) return localPrompt(systemPrompt, prompt, schema);
    return callOffscreen('NANO_PROMPT', { systemPrompt, prompt, schema });
}
