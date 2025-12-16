import { aiService } from '../utils/ai_service.js';
import { updateAnalysisState } from './update_analysis_state.js';
import { processAiArtifacts } from './process_ai_artifacts.js';

export async function analyzeConversation(conv, apiKey, provider, thresholdHours) {
    const now = Date.now();
    const lastAnalyzed = conv.lastAnalyzed || 0;
    const hoursSinceLastCheck = (now - lastAnalyzed) / (1000 * 60 * 60);

    // Debounce Check (Strict)
    // 1. If time interval is not breached yet, do not analyse (throttle)
    if (hoursSinceLastCheck < thresholdHours) {
        console.log(`LinkBee: [SKIP] Interval protection for ${conv.name} (${hoursSinceLastCheck.toFixed(1)}h < ${thresholdHours}h)`);
        return false;
    }

    // 2. If time interval is breached, and there is no history change, do not analyse
    // (Exception: Always analyze if it's the first time, i.e., lastAnalyzed is 0)
    if (!conv.history_changed_since_analyzed && lastAnalyzed !== 0) {
        console.log(`LinkBee: [SKIP] No history change for ${conv.name} (${hoursSinceLastCheck.toFixed(1)}h since last check)`);
        return false;
    }

    // 3. If time interval is breached and the history has changed then analyze
    console.log(`LinkBee: [ANALYZING] Interval breached & History changed for ${conv.name}`);

    // Data Validity Check
    if (!conv.lastTimestamp || isNaN(conv.lastTimestamp)) return false;

    const daysSince = Math.max(0, (now - conv.lastTimestamp) / (1000 * 60 * 60 * 24));

    // Check for previous notifications to provide context
    const nStore = await chrome.storage.local.get('notifications');
    const existingNotifications = nStore.notifications || [];
    const lastNotif = existingNotifications.find(n => n.conversationId === conv.id);
    const lastNotificationStr = lastNotif ? new Date(lastNotif.timestamp).toLocaleDateString() : "Never";

    // Prepare Context
    const context = {
        lastMessage: conv.lastMessage,
        lastSenderIsMe: conv.lastSenderIsMe,
        daysSince: daysSince.toFixed(1),
        history: conv.history || [],
        previousAnalysis: {
            decision: conv.aiLastDecision || "None",
            reason: conv.aiReason || "None",
            category: conv.aiCategory || "None",
            date: conv.aiAnalysisDate ? new Date(conv.aiAnalysisDate).toLocaleDateString() : "Never"
        }
    };

    console.log(`LinkBee: Analyzing ${conv.name} (${daysSince.toFixed(1)}d)...`);

    // Execute Analysis
    updateAnalysisState(1);
    let result = null;
    try {
        result = await aiService.analyze(provider, context, apiKey);
    } catch (e) {
        console.error("LinkBee: Analysis Error", e);
    } finally {
        updateAnalysisState(-1);
    }

    // Update Conversation State
    conv.lastAnalyzed = now;
    conv.history_changed_since_analyzed = false;

    if (result) {
        // Store all AI fields
        conv.aiLastDecision = result.decision; // Fixed: Use consistent property
        conv.aiReason = result.reason;
        conv.aiCategory = result.category;
        conv.aiConfidence = result.confidence_score;
        conv.aiScenario = result.scenario_type;
        conv.aiSampleMessage = result.sample_follow_up_message;
        conv.aiAnalysisDate = now;

        // Process artifacts (Reminders & Notifications)
        await processAiArtifacts(conv, result);
    }
}