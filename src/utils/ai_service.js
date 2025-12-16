import { GoogleGenAI } from "@google/genai";

/**
 * AI Integration Service
 * Handles communication with LLM providers (OpenAI, Gemini).
 * Uses @google/genai SDK as requested.
 */

class AIStrategy {
    // Removed generateFollowUp as requested
    async shouldFollowUp(context, apiKey) {
        throw new Error("Method 'shouldFollowUp' must be implemented.");
    }
}

class OpenAIStrategy extends AIStrategy {
    async shouldFollowUp(context, apiKey) {
        // ... (Keep existing simple logic or update? User seems focused on Gemini)
        // For safety, I'll keep the basic JSON prompt here too for compatibility
        const url = "https://api.openai.com/v1/chat/completions";
        const prompt = `
            Analyze this conversation.
            Context: ${JSON.stringify(context)}
            Return JSON: { "decision": "YES"|"NO", "reason": "...", "category": "Recruiter"|"Friend"|"Cold"|"Other" }
        `;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (!response.ok) return null;
            const data = await response.json();
            const content = data.choices[0].message.content;
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    }
}

class GeminiStrategy extends AIStrategy {
    async shouldFollowUp(context, apiKey) {
        try {
            const client = new GoogleGenAI({ apiKey: apiKey });

            // Prepare History
            const allMessages = context.history || [];
            const contextMessages = allMessages.slice(-15);
            const contextText = contextMessages.map(m => `[${m.isMe ? 'Me' : 'Them'}]: ${m.text}`).join("\n");

            // Decision Focus
            const decisionMessages = allMessages.slice(-4);
            let decisionText = "";
            if (decisionMessages.length > 0) {
                decisionText = decisionMessages.map(m => `[${m.isMe ? 'Me' : 'Them'}]: ${m.text}`).join("\n");
            } else {
                decisionText = `[Last Message]: "${context.lastMessage}"`;
            }
            console.log("INPUT DATA: ", {
                contextText,
                decisionText,
                daysSince: context.daysSince,
                conversationLength: context.history.length,
                previousAnalysis: context.previousAnalysis
            });
            const prompt = `
                You are LinkBee, an elite Technical Career Coach for Software Engineers.
                Your goal is to scan the user's LinkedIn inbox to uncover hidden **Software Engineering Job Opportunities** (SDE, Backend, Frontend, Fullstack).

                Current Date: ${new Date().toDateString()}
                
                === BACKGROUND CONTEXT (History) ===
                ${contextText}

                === ACTIVE EXCHANGE (Last 4 messages) ===
                ${decisionText}
                
                === INPUT DATA ===
                - Days since last message: ${context.daysSince}
                - Conversation Length: ${context.history.length}
                - Previous Analysis (if any):
                  - Decision: ${context.previousAnalysis?.decision || "None"}
                  - Reason: ${context.previousAnalysis?.reason || "N/A"}
                  - Date: ${context.previousAnalysis?.date || "N/A"}

                === INSTRUCTIONS ===
                
                PHASE 1: CLASSIFY RELATIONSHIP
                - **"Recruiter/Sourcer":** Inbound or Outbound recruitment.
                - **"Engineering Leader":** EM, CTO, VP, Tech Lead (Decision Maker).
                - **"Peer/Alumni":** SDE, Senior Engineer, Alumni (Referral Source).
                - **"Other":** Non-tech.

                PHASE 2: DETECT OPPORTUNITY SIGNALS (The 7 Scenarios)
                Analyze the text for these specific patterns:
                
                A. THE "INBOUND RECRUITER" RECOVERY:
                - Did a recruiter reach out first? Did the thread die?
                - *Strategy:* "Warm Lead" revival.
                
                B. THE "COLD OUTREACH" SECOND SHOT:
                - Did "Me" send a cold message > 5 days ago with no reply?
                - *Strategy:* Value-add follow-up (not just "bumping").
                
                C. THE "CASUAL INTEL" CHECK (Friends/Peers):
                - Did "Them" mention "busy team", "growing", "funding", or "lots of interviews"?
                - *Strategy:* Implicit hiring signal -> Pivot to job ask.
                
                D. THE "SENIOR ASK" FOLLOW-THROUGH:
                - Did "Me" ask for a referral/advice? Did "Them" agree but not deliver?
                - *Strategy:* Gentle nudge on the specific deliverable.

                E. THE "STRATEGIC PIVOT" (Social -> Business):
                - Did the conversation end naturally on a social note (e.g., "Congrats")?
                - **CRITICAL:** Is "Them" an **Engineering Leader** or **Recruiter**?
                - *Strategy:* Use social warmth to transition to a professional ask.

                F. THE "TIMED DEFERRAL" (Regular Follow-up):
                - Did "Them" say "Contact me in Q3", "Busy until Friday", "After the holidays"?
                - **CHECK:** Has that specific timeframe PASSED or ARRIVED?
                
                G. THE "DORMANT REVIVAL" (No Signal / Long Time):
                - **CHECK:** Has it been > 90 days since the last message?
                - **CHECK:** Was the last interaction positive/neutral (not a rejection)?
                - **CHECK:** Is this a "Warm" connection (at least 3-4 exchanged messages in history)?
                - *Strategy:* "Update" check-in. Share a win/project to get back on their radar.

                PHASE 3: DECISION LOGIC (Strict & Strategic)
                - **YES (High Priority):** Scenarios A (Recovery), D (Senior Ask), or F (Timed Deferral). (> 1 day to decide yes on followup)
                - **YES (Strategic):** Scenario E (Strategic Pivot) -- Applies to **ALL** categories (Recruiter, Leader, Peer/Alumni) (CHECK FOR TIMELINE. > 2 days to decide yes on followup).
                - **YES (Maintenance):** Scenario G (Dormant Revival) -- ONLY if connection is "Warm" (not failed cold outreach).
                - **YES (Opportunistic):** Scenario C (Casual Intel) or B (Cold Follow-up > 5 days).
                - **NO:** Scenario G if the connection was "Cold" (history length < 2) or "Other".
                - **NO:** If "Last Notification Based on Timeline" is recently set and no significant new context (messages) has occurred since then, output NO to avoid duplicate nudges.
                - **NO:** Hard rejection ("We filled the role") or Deferral date is still in FUTURE.

                PHASE 4: DRAFTING (Engineering Context)
                - **Tone:** Concise, low-friction, professional.
                - **Drafts:**
                - * (A) Recruiter: "Hi [Name], circling back on this. Is the [Role Name] still open?"
                - * (D) Senior: "Hi [Name], just following up on the resume I sent over. Any thoughts?"
                - * (F) Deferral: "Hi [Name], checking in as discussed. You mentioned [Date/Event] might be a better time?"
                - * (G) Dormant: "Hi [Name], hope you're well! I just shipped [Project/Feature] using [Tech Stack] and thought of our last chat about [Topic]. How are things at [Company]?"

                === OUTPUT FORMAT (JSON ONLY) ===
                {
                    "decision": "YES" or "NO",
                    "confidence_score": number (0-100),
                    "reason": "Specific context (e.g., 'Scenario G: Warm connection dormant for 120 days -> Update check-in').",
                    "category": "Recruiter" | "Engineering Leader" | "Peer/Alumni" | "Other",
                    "scenario_type": "Inbound Recovery" | "Cold Follow-up" | "Casual Intel" | "Senior Ask" | "Strategic Pivot" | "Timed Deferral" | "Dormant Revival" | "None",
                    "sample_follow_up_message": "Draft a contextual message based on the identified scenario.",
                    "reminder": { "text": "Follow up on [Role/Referral]", "suggested_date": "YYYY-MM-DD" } or null
                }
            `;

            // SDK Usage as requested (Reverting raw fetch)
            // SDK Usage
            let response;
            try {
                // User requested Gemini 2.0 Flash (Experimental)
                console.log("[LinkBee AI] Attempting analysis with gemini-2.0-flash-exp...");
                response = await client.models.generateContent({
                    model: "gemini-2.0-flash-exp",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json" }
                });
            } catch (err) {
                console.error("[LinkBee AI] Analysis failed:", err);
                return null;
            }

            // Handle SDK response variations
            let text = "";
            if (response.text && typeof response.text === 'function') {
                text = response.text();
            } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
                text = response.candidates[0].content.parts[0].text;
            } else {
                text = JSON.stringify(response);
            }

            // Parse JSON
            const cleanJson = text.replace(/```json|```/g, '').trim();
            const analysis = JSON.parse(cleanJson);

            console.log(`[LinkBee AI] Category: ${analysis.category} | Decision: ${analysis.decision}`);
            return analysis;

        } catch (e) {
            console.error("Gemini SDK Analysis Error:", e);
            return null;
        }
    }
}

class AIService {
    constructor() {
        this.strategies = {
            openai: new OpenAIStrategy(),
            gemini: new GeminiStrategy()
        };
    }

    async analyze(provider, context, apiKey) {
        const strategy = this.strategies[provider];
        if (!strategy) return null;
        return await strategy.shouldFollowUp(context, apiKey);
    }
}

export const aiService = new AIService();