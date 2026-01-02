import { GoogleGenAI } from "@google/genai";
import { CONNECTION_ANALYSIS_PROMPT } from './prompts/connection_analysis_prompt.js';
import { PROFILE_VIEW_PROMPT } from './prompts/profile_view_prompt.js';

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

    // 1. Analyze Conversation for Follow-up Opportunities
    async analyze(provider, context, apiKey) {
        // We only support Gemini for advanced analysis right now
        if (provider !== 'gemini' && provider !== 'openai') return null; // Fallback or strict

        try {
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

            console.log("[LinkBee AI] Analyzing Conversation...");
            const result = await client.generate(prompt, true);

            console.log(`[LinkBee AI] Result: ${result.decision} (${result.category})`);
            return result;

        } catch (e) {
            console.error("AI Analysis Failed:", e);
            return null;
        }
    }

    // 2. Generate Hook for Profile View (or any generic message)
    async generateMessage(params) {
        const { provider, apiKey, history, myProfile } = params;

        try {
            const client = new GeminiClient(apiKey);

            // The history[0].text contains the raw prompt from the caller
            // This is a bit of a legacy signature adaptation.
            // Ideally we'd just pass 'prompt' directly. 
            // We'll extract the prompt text from the 'history' object passed by the caller.

            let prompt = "";
            if (history && history.length > 0) {
                prompt = history[0].text;
            }

            if (!prompt) return { suggestion: "Error: No prompt provided." };

            console.log("[LinkBee AI] Generating Message...");

            // For profile views, we usually want specific JSON structure OR just text.
            // The prompt in process_profile_views.js (now imported?) requested text.
            // But wait, the previous implementation in process_profile_views.js was expecting
            // `aiResponse.suggestion`. So we should probably return JSON.

            // Let's modify the prompt to ensure JSON output if we want structure, 
            // OR we wrap the text result.
            // The ProfileView Prompt requests "Max 2 sentences". It doesn't explicitly ask for JSON.
            // So let's assume text mode, but wrap it for the caller.

            const textParams = {
                responseMimeType: "text/plain"
            };

            // Start Generation
            // Use generating in TEXT mode for creative writing usually, but we can force JSON if needed.
            // The prompt we moved (PROFILE_VIEW_PROMPT) does NOT ask for JSON.
            // So we use text mode.

            const resultText = await client.generate(prompt, false);

            return {
                suggestion: resultText
            };

        } catch (e) {
            console.error("AI Message Generation Failed:", e);
            return { suggestion: "Error generating message." };
        }
    }
}

export const aiService = new AIService();