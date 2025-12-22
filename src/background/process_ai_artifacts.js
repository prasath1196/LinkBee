
export async function processAiArtifacts(conv, result) {
    // 1. Handle Reminders
    if (result.reminder && result.reminder.text) {
        const rStore = await chrome.storage.local.get('reminders');
        const reminders = rStore.reminders || [];

        // Dedupe active AI reminders for this thread
        const hasPending = reminders.some(r =>
            r.conversationId === conv.id && r.source === 'ai' && r.status === 'pending'
        );

        if (!hasPending) {
            reminders.push({
                id: crypto.randomUUID(),
                conversationId: conv.id,
                text: result.reminder.text,
                dueDate: result.reminder.suggested_date ? Date.parse(result.reminder.suggested_date) : null,
                createdDate: Date.now(),
                source: 'ai',
                status: 'pending'
            });
            await chrome.storage.local.set({ reminders });
            console.log(`LinkBee: [SAVED] AI Reminder added for ${conv.name}`);
        }
    }

    // 2. Handle Notifications (Decision = YES)
    if (result.decision === "YES") {
        conv.needsAction = true;

        const nStore = await chrome.storage.local.get('notifications');
        const notifications = nStore.notifications || [];

        // Dedupe notifications for this conversation
        // STRICT: If notification exists, DO NOT create a new one (Spam Prevention)
        const alreadyNotified = notifications.find(n => n.conversationId === conv.id);

        if (alreadyNotified) {
            console.log(`LinkBee: [SKIP] Notification already active for ${conv.name}`);
            return;
        }

        if (!alreadyNotified) {
            // Prepare payload: Full conv data except heavy history
            const { history, ...conversationData } = conv;

            notifications.push({
                id: crypto.randomUUID(),
                conversationId: conv.id,
                name: conv.name,
                message: result.sample_follow_up_message || "Time to follow up!",
                reason: result.reason,
                category: conv.aiCategory || "General",
                timestamp: Date.now(),
                url: conv.url || "https://www.linkedin.com/messaging/",
                analysisDate: Date.now(), // Track when this specific analysis decision was made
                ...conversationData // Include all other AI fields and metadata
            });

            // Update Conversation with Hash Lock
            conv.lastNotificationHash = conv.currentHash;

            await chrome.storage.local.set({ notifications });
            console.log(`LinkBee: [SAVED] Notification created for ${conv.name} (Hash Lock: ${conv.lastNotificationHash})`);
        }
    } else {
        conv.needsAction = false;
    }
}
