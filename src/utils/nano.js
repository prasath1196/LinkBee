/**
 * Chrome Built-in AI (Gemini Nano) via the Prompt API.
 * Runs in any context that exposes the `LanguageModel` global
 * (service worker, offscreen document, side panel).
 */

export const NANO_OPTIONS = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
};

export function hasPromptApi() {
    return typeof LanguageModel !== 'undefined';
}

// Returns "available" | "downloadable" | "downloading" | "unavailable"
export async function localAvailability() {
    if (!hasPromptApi()) return 'unavailable';
    try {
        return await LanguageModel.availability(NANO_OPTIONS);
    } catch (e) {
        console.warn("LinkBee: [Nano] availability check failed", e);
        return 'unavailable';
    }
}

// Cache one base session per system prompt; clone it per request so calls don't share history.
const baseSessions = new Map();

async function getBaseSession(systemPrompt) {
    if (!baseSessions.has(systemPrompt)) {
        const sessionPromise = LanguageModel.create({
            ...NANO_OPTIONS,
            initialPrompts: [{ role: 'system', content: systemPrompt }]
        });
        baseSessions.set(systemPrompt, sessionPromise);
        sessionPromise.catch(() => baseSessions.delete(systemPrompt));
    }
    return baseSessions.get(systemPrompt);
}

/**
 * Run a single prompt.
 * @param {string} systemPrompt
 * @param {string} prompt
 * @param {object|null} schema - JSON schema; when given, output is parsed JSON.
 */
export async function localPrompt(systemPrompt, prompt, schema = null) {
    if ((await localAvailability()) !== 'available') {
        throw new Error('Gemini Nano is not available');
    }

    const base = await getBaseSession(systemPrompt);
    const session = await base.clone();
    try {
        // Guard against the small context window
        if (session.measureInputUsage && session.inputQuota) {
            const usage = await session.measureInputUsage(prompt);
            if (usage > session.inputQuota - session.inputUsage) {
                throw new Error(`Prompt too large for Nano (${usage} tokens)`);
            }
        }

        const options = schema ? { responseConstraint: schema } : {};
        const text = await session.prompt(prompt, options);
        return schema ? JSON.parse(text) : text.trim();
    } finally {
        session.destroy();
    }
}
