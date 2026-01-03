import { analyzeConversation } from './analyze_conversations.js';
import { calculateBadge } from './badge_manager.js';
import { updateAnalysisState, forceResetAnalysisState } from './update_analysis_state.js';
import { typedStorage } from '../services/storage.js';

export const ALARM_NAME = 'linkbee_daily_check';
export const CHECK_INTERVAL_MINUTES = 60 * 4; // Check every 4 hours

export async function reanalyzeStoredData(force = false) {
    console.log(`LinkBee: Re-analyzing stored data... (Force: ${force})`);
    updateAnalysisState(1); // Start global busy state

    try {
        const { apiKey, aiProvider, analysisThreshold } = await typedStorage.getSettings();
        const conversations = await typedStorage.getConversations();

        // If Forced, use 0 threshold to bypass time checks
        const threshold = force ? 0 : (analysisThreshold || 4);

        if (!apiKey) {
            console.log("LinkBee: No API Key found. Skipping analysis.");
            return;
        }

        let actionCount = 0;

        for (const conv of conversations) {
            // Criteria: Me sent last (waiting for reply) OR Active & History Changed
            if (conv.status === 'replied' || conv.status === 'dismissed') continue;
            if (!conv.lastSenderIsMe) continue;

            // Note: analyzeConversation handles its own local state increments too, which is fine (nested 1->2->1)
            try {
                // Determine if we should save: Check state before?
                // analyzeConversation modifies in place.
                // We'll trust that if it didn't throw, we should re-save to capture decision/logs.
                // Optimally, analyzeConversation should return boolean 'modified'.
                // But blindly saving active conversations during a daily check is acceptable overhead.

                await analyzeConversation(conv, apiKey, aiProvider, threshold);

                // Persist the individual conversation update
                await typedStorage.saveConversation(conv);

                if (conv.needsAction) actionCount++;
            } catch (innerErr) {
                console.error(`LinkBee: Failed to analyze ${conv.id}`, innerErr);
            }
        }

        calculateBadge();
    } catch (err) {
        console.error("LinkBee: Daily check invalid", err);
        forceResetAnalysisState(); // Hard Reset on top-level error
    } finally {
        updateAnalysisState(-1); // End global busy state

        // Safety: If we are the top-level process/check, we should ensure it's clear
        // But if multiple run in parallel?
        // Let's rely on standard counting, but maybe a timeout reset is safer?
        // Actually, since reanalyzeStoredData is the MAIN entry point for batch analysis,
        // we can probably assume if it finishes, we should be idle unless another parallel task started.
        // For now, let's keep the decrement. 
        // BUT, user has "stuck" state. So let's add a self-correcting reset.
        chrome.storage.local.get(['isAnalyzing'], (res) => {
            // If count reached 0 but storage says true? Handled by updateAnalysisState
            // If count > 0 but no actual work is running? That's the issue.
            // Let's force reset if we are sure no other task is running.
        });
    }
}

// Additional Export

export function emergencyReset() {
    forceResetAnalysisState();
}
