import { aiService } from '../utils/ai_service.js';
import { updateAnalysisState } from './update_analysis_state.js';
import { processAiArtifacts } from './process_ai_artifacts.js';
import { typedStorage } from '../services/storage.js';

// Global Set to track active analysis to prevent race conditions (Debounce)
const activeAnalysisIds = new Set();

export async function analyzeConversation(conv, apiKey, provider, thresholdHours) {
    // 0. DEBOUNCE CHECK
    if (activeAnalysisIds.has(conv.id)) {
        console.log(`LinkBee: [DEBOUNCE] Analysis already in progress for ${conv.name} (${conv.id})`);
        return false;
    }

    activeAnalysisIds.add(conv.id);

    try {
        const now = Date.now();
        // SMART CADENCE & CONTEXT LOGIC
        const MAX_FOLLOWUPS = 4; // Stop after 4 (0-based count: 3 previous followups)
        let myConsecutiveCount = 0;
        // 0. QUICK GUARDRAILS
        // 0. QUICK GUARDRAILS (Dynamic Identity Check)
        const myProfile = await typedStorage.getUserProfile();
        const myName = myProfile?.name || "Me";
        const myUrn = myProfile?.urn;

        // Dynamic Self-Detection Logic
        let isSelf = false;

        // 1. Check ID/URN match
        if (myUrn && (conv.id === myUrn || conv.urn === myUrn)) isSelf = true;

        // 2. Check Name match
        if (conv.name === myName || conv.name === "Me" || conv.name === "Unknown") isSelf = true;

        // 3. Fallback: Check if name *contains* my name (if long string)
        if (myName !== "Me" && conv.name.includes(myName)) isSelf = true;

        if (isSelf) {
            console.log(`LinkBee: [SKIP] Skipping analysis for self/unknown (${conv.name})`);
            return false;
        }

        const { history } = conv;
        if (!history || history.length === 0) return false;
        const previousFollowups = [];

        // Count backwards and collect context
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.isMe) {
                myConsecutiveCount++;
                previousFollowups.push({
                    date: new Date(msg.timestamp || Date.now()).toISOString(),
                    message: msg.text
                });
            } else {
                break;
            }
        }

        if (myConsecutiveCount >= MAX_FOLLOWUPS) {
            console.log(`LinkBee: [SKIP] Max follow - ups reached(${myConsecutiveCount}) for ${conv.name}`);
            return false;
        }

        // DYNAMIC SILENCE THRESHOLD (The "Smart" Wait)
        // 0 sent (Received last): Wait 1 day before replying (Standard)
        // 1 sent (1st Follow-up): Wait 3 days
        // 2 sent (2nd Follow-up): Wait 7 days
        // 3 sent (3rd Follow-up): Wait 14 days

        let requiredSilenceHours = 24;
        if (myConsecutiveCount === 1) requiredSilenceHours = 24 * 3;
        if (myConsecutiveCount === 2) requiredSilenceHours = 24 * 7;
        if (myConsecutiveCount === 3) requiredSilenceHours = 24 * 14;

        const hoursSinceLastMessage = (now - conv.lastTimestamp) / (1000 * 60 * 60);

        // Only skip if thresholdHours is not 0 (Force Mode bypasses)
        if (hoursSinceLastMessage < requiredSilenceHours && thresholdHours !== 0) {
            console.log(`LinkBee: [SKIP] Too soon for follow - up #${myConsecutiveCount + 1}. Waited ${hoursSinceLastMessage.toFixed(1)} h / ${requiredSilenceHours} h.`);
            return false;
        }

        // Pass context to AI (Reverse so it's chronological)
        const contextMap = previousFollowups.reverse();

        // HASH-BASED & GHOSTING DETECTION STRATEGY
        const currentHash = conv.currentHash;
        const lastNotifHash = conv.lastNotificationHash;
        const GHOSTING_CHECK_INTERVAL_HOURS = 24;

        // Calulate Time Since Last Analysis
        const hoursSinceLastCheck = (now - (conv.lastAnalyzed || 0)) / (1000 * 60 * 60);

        let shouldAnalyze = false;
        let triggerReason = "";

        // 1. Missing Hash (Legacy or First Run)
        if (!currentHash) {
            shouldAnalyze = true;
            triggerReason = "Missing_Hash";
            console.log(`LinkBee: [ANALYZING] Missing Hash(First Run / Legacy) for ${conv.name}`);
        }
        // 2. Hash Mismatch (Content Changed - New Message)
        else if (currentHash !== lastNotifHash) {
            shouldAnalyze = true;
            triggerReason = "Content_Changed";
            console.log(`LinkBee: [ANALYZING] Content Changed for ${conv.name}(Hash: ${currentHash} vs ${lastNotifHash})`);
        }
        // 3. Hash Match (Content Same) -> Check for Ghosting (Time Elapsed)
        else {
            if (hoursSinceLastCheck > GHOSTING_CHECK_INTERVAL_HOURS) {
                shouldAnalyze = true;
                triggerReason = "Ghosting_Check";
                console.log(`LinkBee: [ANALYZING] Ghosting Check(> 24h since last) for ${conv.name}`);
            } else {
                console.log(`LinkBee: [SKIP] No Change & Recent Analysis(${hoursSinceLastCheck.toFixed(1)}h) for ${conv.name}`);
                return false;
            }
        }

        // Data Validity Check
        if (!conv.lastTimestamp || isNaN(conv.lastTimestamp)) return false;

        const daysSince = Math.max(0, (now - conv.lastTimestamp) / (1000 * 60 * 60 * 24));

        // Check for previous notifications to provide context
        const existingNotifications = await typedStorage.getNotifications();
        const lastNotif = existingNotifications.find(n => n.conversationId === conv.id);
        const lastNotificationStr = lastNotif ? new Date(lastNotif.timestamp).toLocaleDateString() : "Never";

        // Prepare Context
        const context = {
            lastMessage: conv.lastMessage,
            lastSenderIsMe: conv.lastSenderIsMe,
            daysSince: daysSince.toFixed(1),
            history: conv.history || [],
            previous_followups: contextMap, // Pass extracted context
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
            // SMART FILTER: High-Pass Filter for Low Context
            // If history is short (< 2) AND confidence is low (< 60), treat as NO.
            const isLowContext = history.length < 2;
            if (isLowContext && result.confidence_score < 60 && result.decision === "YES") {
                console.log(`LinkBee: [FILTERED] Result filtered due to Low Confidence (${result.confidence_score}) in Low Context.`);
                result.decision = "NO"; // Soft override
                result.reason = "Low Confidence (Best Effort filtered)";
            }

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

            // OBSERVABILITY LOGGING
            const logEntry = {
                id: crypto.randomUUID(),
                timestamp: now,
                conversationId: conv.id,
                conversationName: conv.name,
                triggerReason: triggerReason,
                decision: result.decision,
                reason: result.reason,
                confidence: result.confidence_score,
                processingTime: Date.now() - now
            };

            const logs = await typedStorage.getAnalysisLogs();
            // Keep last 100 logs
            if (logs.length > 100) logs.shift();
            logs.push(logEntry);
            await typedStorage.saveAnalysisLogs(logs);
        }
    } finally {
        activeAnalysisIds.delete(conv.id);
    }
}