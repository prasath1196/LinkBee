import { analyzeConversation } from './analyze_conversations.js';
import { calculateBadge } from './badge_manager.js';
import { updateAnalysisState } from './update_analysis_state.js';

export const ALARM_NAME = 'linkbee_daily_check';
export const CHECK_INTERVAL_MINUTES = 60 * 4; // Check every 4 hours

export async function reanalyzeStoredData() {
    console.log(`LinkBee: Re-analyzing stored data...`);
    updateAnalysisState(1); // Start global busy state

    try {
        const store = await chrome.storage.local.get(['conversations', 'apiKey', 'aiProvider', 'analysisThreshold']);
        const conversations = store.conversations || {};
        const apiKey = store.apiKey;
        const provider = store.aiProvider;
        const threshold = store.analysisThreshold || 24;

        if (!apiKey) {
            console.log("LinkBee: No API Key found. Skipping analysis.");
            return;
        }

        let actionCount = 0;

        for (const id in conversations) {
            const conv = conversations[id];

            // Criteria: Me sent last (waiting for reply) OR Active & History Changed
            if (conv.status === 'replied' || conv.status === 'dismissed') continue;
            if (!conv.lastSenderIsMe) continue;

            // Note: analyzeConversation handles its own local state increments too, which is fine (nested 1->2->1)
            await analyzeConversation(conv, apiKey, provider, threshold);

            if (conv.needsAction) actionCount++;
        }

        await chrome.storage.local.set({ conversations });
        calculateBadge();
    } catch (err) {
        console.error("LinkBee: Daily check invalid", err);
    } finally {
        updateAnalysisState(-1); // End global busy state
    }
}
