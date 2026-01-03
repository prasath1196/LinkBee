import {
    StoredConversationSchema,
    SettingsSchema,
    type StoredConversation,
    type UserProfile,
    type Settings,
    type AiAnalysisLog,
    type Notification,
    type Reminder,
    type ProfileView
} from '../types/storage';

/**
 * typedStorage
 * A strongly-typed wrapper around chrome.storage.local using Zod for validation.
 */
export const typedStorage = {

    /**
     * Get all conversations.
     * Validates each entry against StoredConversationSchema.
     */
    async getConversations(): Promise<StoredConversation[]> {
        return new Promise((resolve) => {
            chrome.storage.local.get('conversations', (items) => {
                const conversationsMap = (items.conversations || {}) as Record<string, unknown>;
                const results: StoredConversation[] = [];

                for (const [key, value] of Object.entries(conversationsMap)) {
                    // Validation
                    const result = StoredConversationSchema.safeParse(value);
                    if (result.success) {
                        results.push(result.data);
                    } else {
                        console.warn(`TypedStorage: Invalid conversation (Key: ${key})`, result.error);
                    }
                }
                resolve(results);
            });
        });
    },

    /**
     * Get a specific conversation by ID (URN).
     */
    async getConversation(id: string): Promise<StoredConversation | null> {
        return new Promise((resolve) => {
            chrome.storage.local.get('conversations', (items) => {
                const conversationsMap = (items.conversations || {}) as Record<string, unknown>;
                const raw = conversationsMap[id];

                if (!raw) {
                    resolve(null);
                    return;
                }

                const result = StoredConversationSchema.safeParse(raw);
                if (result.success) {
                    resolve(result.data);
                } else {
                    console.warn(`TypedStorage: Validation failed for key ${id}`, result.error);
                    resolve(null);
                }
            });
        });
    },

    /**
     * Save a conversation.
     */
    async saveConversation(conversation: StoredConversation): Promise<void> {
        // Runtime validation
        const result = StoredConversationSchema.safeParse(conversation);
        if (!result.success) {
            throw new Error(`TypedStorage: Invalid conversation data: ${result.error.message}`);
        }

        // Get current map, update, save back (Atomic-ish)
        return new Promise((resolve) => {
            chrome.storage.local.get('conversations', (items) => {
                const conversations = (items.conversations || {}) as Record<string, StoredConversation>;
                conversations[conversation.id] = conversation;

                chrome.storage.local.set({ conversations }, () => {
                    resolve();
                });
            });
        });
    },

    /**
     * Get Settings (Flattened Root Keys)
     */
    async getSettings(): Promise<Settings> {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                // We assume root keys match SettingsSchema
                // Filter keys that are known settings
                const settingsCandidate = {
                    aiProvider: items.aiProvider,
                    apiKey: items.apiKey,
                    analysisThreshold: items.analysisThreshold,
                    autoScan: items.autoScan,
                    profileViewTracking: items.profileViewTracking,
                    daysToFetch: items.daysToFetch,
                    analysisInterval: items.analysisInterval,
                    lastScanTimestamp: items.lastScanTimestamp
                };

                const result = SettingsSchema.safeParse(settingsCandidate);
                if (result.success) {
                    resolve(result.data);
                } else {
                    // Return default/partial if validation fails (e.g. fresh install)
                    resolve({});
                }
            });
        });
    },

    /**
     * Save Settings
     */
    async saveSettings(settings: Settings): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set(settings, () => resolve());
        });
    },

    /**
     * Get AI Analysis Logs
     */
    async getAnalysisLogs(): Promise<AiAnalysisLog[]> {
        return new Promise((resolve) => {
            chrome.storage.local.get('analysis_logs', (items) => {
                const logs = (items.analysis_logs || []) as AiAnalysisLog[];
                resolve(logs);
            });
        });
    },

    /**
     * Save AI Analysis Logs
     */
    async saveAnalysisLogs(logs: AiAnalysisLog[]): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({ analysis_logs: logs }, () => resolve());
        });
    },

    /**
     * Get Notifications
     */
    async getNotifications(): Promise<Notification[]> {
        return new Promise((resolve) => {
            chrome.storage.local.get('notifications', (items) => {
                const logs = (items.notifications || []) as Notification[];
                resolve(logs);
            });
        });
    },

    /**
     * Save Notifications
     */
    async saveNotifications(notifications: Notification[]): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({ notifications }, () => resolve());
        });
    },

    /**
     * Get Reminders
     */
    async getReminders(): Promise<Reminder[]> {
        return new Promise((resolve) => {
            chrome.storage.local.get('reminders', (items) => {
                const reminders = (items.reminders || []) as Reminder[];
                resolve(reminders);
            });
        });
    },

    /**
     * Save Reminders
     */
    async saveReminders(reminders: Reminder[]): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({ reminders }, () => resolve());
        });
    },

    /**
     * Get Profile Views
     */
    async getProfileViews(): Promise<Record<string, ProfileView>> {
        return new Promise((resolve) => {
            chrome.storage.local.get('profileViews', (items) => {
                const views = (items.profileViews || {}) as Record<string, ProfileView>;
                resolve(views);
            });
        });
    },

    /**
     * Save Profile Views
     */
    async saveProfileViews(profileViews: Record<string, ProfileView>): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({ profileViews }, () => resolve());
        });
    },

    /**
     * Get User Profile
     */
    async getUserProfile(): Promise<UserProfile | null> {
        return new Promise((resolve) => {
            chrome.storage.local.get('userProfile', (items) => {
                const profile = items.userProfile as UserProfile | undefined;
                resolve(profile || null);
            });
        });
    }
};
