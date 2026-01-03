import { aiService } from '../utils/ai_service.js';
import { typedStorage } from '../services/storage.js';

/**
 * processProfileViews
 * @param {Array} newViews - Array of view objects scraped from content script
 */
export async function processProfileViews(newViews) {
    if (!newViews || newViews.length === 0) return;

    console.log(`LinkBee: [BG] Processing ${newViews.length} profile views...`);

    const { aiProvider, apiKey } = await typedStorage.getSettings();
    let storedViews = await typedStorage.getProfileViews();
    let changed = false;

    // Filter for new or updated views
    const viewsToAnalyze = [];

    newViews.forEach(view => {
        // If it doesn't exist, or if it's been more than 7 days, we might re-analyze. 
        // For now, let's just add if new.
        if (!storedViews[view.id]) {
            storedViews[view.id] = {
                ...view,
                status: 'new',
                aiStatus: 'pending',
                analyzedAt: 0
            };
            viewsToAnalyze.push(storedViews[view.id]);
            changed = true;
        } else {
            // Update time if fresher
            storedViews[view.id].timeStr = view.timeStr;
            storedViews[view.id].scrapedAt = Date.now();
        }
    });

    if (changed) {
        await typedStorage.saveProfileViews(storedViews);

        // Notify UI to update if open
        chrome.runtime.sendMessage({ type: "PROFILE_VIEWS_UPDATED" }).catch(() => { });
    }

    if (viewsToAnalyze.length > 0) {
        console.log(`LinkBee: [AI] ${viewsToAnalyze.length} new profile views to analyze.`);

        // Process in background
        analyzeProfileViews(viewsToAnalyze, aiProvider || 'openai', apiKey);
    }
}

import { PROFILE_VIEW_PROMPT } from '../utils/prompts/profile_view_prompt.js';

async function analyzeProfileViews(views, provider, apiKey) {
    // Limit batch to avoid rate limits
    const batch = views.slice(0, 5);

    for (const view of batch) {
        try {
            console.log(`LinkBee: [AI] Generating hook for ${view.name}...`);

            const prompt = PROFILE_VIEW_PROMPT(view.name, view.headline);

            const aiResponse = await aiService.generateMessage({
                history: [{ sender: 'System', text: prompt }],
                myProfile: "Software Engineer", // TODO: Get from settings
                provider,
                apiKey
            });

            // Update Storage
            const currentViews = await typedStorage.getProfileViews();

            if (currentViews[view.id]) {
                currentViews[view.id].aiMessage = aiResponse.suggestion;
                currentViews[view.id].aiStatus = 'done';
                currentViews[view.id].analyzedAt = Date.now();

                await typedStorage.saveProfileViews(currentViews);

                // Notify UI
                chrome.runtime.sendMessage({ type: "PROFILE_VIEWS_UPDATED" }).catch(() => { });
            }

        } catch (e) {
            console.error(`LinkBee: [AI] Failed to analyze profile view for ${view.name}`, e);
        }
    }
}
