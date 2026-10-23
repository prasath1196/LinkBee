import { GoogleGenAI } from "@google/genai";
import { CONNECTION_ANALYSIS_PROMPT } from './prompts/connection_analysis_prompt.js';
import { PROFILE_VIEW_PROMPT } from './prompts/profile_view_prompt.js';
import { TRIAGE_SYSTEM_PROMPT, TRIAGE_SCHEMA, TRIAGE_PROMPT } from './prompts/triage_prompt.js';
import { nanoAvailability, nanoPrompt } from './nano_client.js';

/**
 * AI Integration Service
 * Handles communication with LLM providers.
 * Abstraction allows reusing the same client for different prompt types.
 */

class GeminiClient {
    constructor(apiKey) {
        this.client = new GoogleGenAI({ apiKey: apiKey });
        this.model = "gemini-2.5-flash";
    }

    async generate(prompt, jsonMode = true) {
        const MAX_RETRIES = 3;
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            try {
                const config = jsonMode ? { responseMimeType: "application/json" } : {};
                const response = await this.client.models.generateContent({
                    model: this.model,
                    contents: [{ parts: [{ text: prompt }] }],
                    config: config
                });

                // Extract Text
                let text = "";
                if (response.text && typeof response.text === 'function') {
                    text = response.text();
                } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
                    text = response.candidates[0].content.parts[0].text;
                } else {
                    text = JSON.stringify(response);
                }

                if (jsonMode) {
                    const cleanJson = text.replace(/```json|```/g, '').trim();
                    return JSON.parse(cleanJson);
                }
                return text;

            } catch (e) {
                attempt++;
                const isOverloaded = e.message?.includes("503") || e.status === 503 || e.code === 503;
                const isRateLimit = e.message?.includes("429") || e.status === 429 || e.code === 429;

                if ((isOverloaded || isRateLimit) && attempt < MAX_RETRIES) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    console.warn(`[Gemini Client] Error ${e.status || 503}. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                console.error("[Gemini Client] Error:", e);
                // If we've exhausted retries or it's a fatal error, throw it
                throw e;
            }
        }
    }
}

class AIService {

    // True if any AI backend (Gemini key or on-device Nano) can run analysis
    async canAnalyze(apiKey) {
        if (apiKey && String(apiKey).trim()) return true;
        return (await nanoAvailability()) === 'available';
    }

    // 1. Analyze Conversation for Follow-up Opportunities
    // Tiered: Nano triage first (free, on-device), escalate to Gemini on YES.
    async analyze(provider, context, apiKey) {
        try {
            if ((await nanoAvailability()) === 'available') {
                const triage = await this.triageWithNano(context);

                if (triage) {
                    if (triage.decision !== 'YES') return triage;
                    if (!apiKey) return triage;

                    try {
                        const result = await this.analyzeWithGemini(context, apiKey);
                        return { ...result, engine: 'nano+gemini' };
                    } catch (e) {
                        console.warn("LinkBee: Gemini escalation failed, using Nano result", e);
                        return triage;
                    }
                }
                // Nano triage failed: fall through to Gemini
            }

            if (!apiKey) return null;

            const result = await this.analyzeWithGemini(context, apiKey);
            return { ...result, engine: 'gemini' };

        } catch (e) {
            console.error("AI Analysis Failed:", e);
            return null;
        }
    }

    // Returns normalized triage result, or null if Nano failed
    async triageWithNano(context) {
        try {
            const history = context.history || [];
            const messages = history.length > 0
                ? history.slice(-8)
                : [{ isMe: !!context.lastSenderIsMe, text: context.lastMessage || '' }];

            console.log("[LinkBee AI] Triaging with Nano...");
            const result = await nanoPrompt(
                TRIAGE_SYSTEM_PROMPT,
                TRIAGE_PROMPT(messages, context),
                TRIAGE_SCHEMA
            );

            result.reminder = result.reminder_date
                ? { text: result.reminder_text || 'Follow up', suggested_date: result.reminder_date }
                : null;
            delete result.reminder_text;
            delete result.reminder_date;
            result.engine = 'nano';

            console.log(`[LinkBee AI] Nano Result: ${result.decision} (${result.category})`);
            return result;
        } catch (e) {
            console.warn("LinkBee: Nano triage failed, falling back to Gemini", e);
            return null;
        }
    }

    // Full Gemini analysis (throws on failure)
    async analyzeWithGemini(context, apiKey) {
        const client = new GeminiClient(apiKey);

        // Prepare Prompt Inputs
        const allMessages = context.history || [];
        const contextMessages = allMessages.slice(-15);
        const contextText = contextMessages.map(m => `[${m.isMe ? 'Me' : 'Them'}]: ${m.text}`).join("\n");

        const decisionMessages = allMessages.slice(-4);
        let decisionText = "";
        if (decisionMessages.length > 0) {
            decisionText = decisionMessages.map(m => `[${m.isMe ? 'Me' : 'Them'}]: ${m.text}`).join("\n");
        } else {
            decisionText = `[Last Message]: "${context.lastMessage}"`;
        }

        const prompt = CONNECTION_ANALYSIS_PROMPT(contextText, decisionText, context, context.previous_followups);

        console.log("[LinkBee AI] Analyzing Conversation with Gemini...");
        const result = await client.generate(prompt, true);

        console.log(`[LinkBee AI] Result: ${result.decision} (${result.category})`);
        return result;
    }

    // 2. Generate a short message (e.g. hook for a profile view)
    // The prompt is passed in history[0].text by the caller.
    async generateMessage(params) {
        const { apiKey, history } = params;

        try {
            const prompt = history && history.length > 0 ? history[0].text : "";
            if (!prompt) return { suggestion: "Error: No prompt provided." };

            console.log("[LinkBee AI] Generating Message...");

            if (apiKey) {
                const client = new GeminiClient(apiKey);
                const resultText = await client.generate(prompt, false);
                return { suggestion: resultText };
            }

            if ((await nanoAvailability()) === 'available') {
                const resultText = await nanoPrompt(
                    'You write short, friendly LinkedIn messages as the user. Never mention AI.',
                    prompt,
                    null
                );
                return { suggestion: resultText };
            }

            return { suggestion: "Error: No AI available. Enable on-device AI or add a Gemini API key." };

        } catch (e) {
            console.error("AI Message Generation Failed:", e);
            return { suggestion: "Error generating message." };
        }
    }
}

export const aiService = new AIService();
