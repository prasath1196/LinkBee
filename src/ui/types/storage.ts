/**
 * Centralized TypeScript definitions for Chrome Storage data models.
 * Used to ensure type safety across the application.
 */

export type AiProvider = 'gemini' | 'openai' | 'anthropic';

// 1. Settings
export interface AppSettings {
    apiKey?: string;
    aiProvider?: AiProvider;
    syncDays?: number;
    analysisThreshold?: number; // Hours
    profileViewTracking?: boolean;
}

// 2. Reminders
export interface AppReminder {
    id: string;
    conversationId: string;
    conversationName?: string;
    text: string;
    dueDate: number | null; // Timestamp
    url?: string; // Deep link to chat
    status: 'pending' | 'done';
    createdDate: number;
    source: 'followup_action' | 'user_manual' | 'ai_auto';
}

// 3. Notifications (AI Follow-up Suggestions)
export interface AppNotification {
    id: string; // notificationId
    conversationId: string;
    urn?: string; // NEW: Profile URN for stable cross-device ID
    conversationName?: string; // Flattened for UI convenience
    name?: string; // Sometimes stored as name in raw data
    timestamp: number;
    reason: string;
    category: string;
    aiReason?: string;
    aiCategory?: string;
    aiSampleMessage?: string;
    sampleMessage?: string; // Legacy / Alternative
    url?: string;
    isRead?: boolean;
}

// 4. Conversations (Cached Data)
export interface AppConversation {
    id: string;
    urn?: string; // NEW: Profile URN
    name: string;
    url?: string;
    lastMessage?: string;
    lastTimestamp?: number;
    lastSenderIsMe?: boolean;
    history?: any[]; // Could define Message type if needed strictly
    // AI Analysis Metadata
    lastAnalyzed?: number;
    aiLastDecision?: "YES" | "NO";
    aiReason?: string;
    aiCategory?: string;
    aiConfidence?: number;
    aiScenario?: string;
    aiSampleMessage?: string;
    aiAnalysisDate?: number;
}

// 5. AI Analysis Logs (Observability)
export interface AiAnalysisLog {
    timestamp: number;
    conversationId: string;
    conversationName: string;
    provider: AiProvider;
    model?: string; // e.g., "gemini-1.5-flash"
    inputContext: {
        daysSince: string | number;
        historyLength: number;
        lastMessageSnippet: string;
    };
    outputResult: {
        decision: "YES" | "NO";
        confidence: number;
        category: string;
        scenario: string;
        reason: string;
    };
    latencyMs?: number;
    error?: string;
}

// 6. Global Storage Schema
export interface StorageSchema {
    // Settings
    apiKey?: string;
    aiProvider?: AiProvider;
    syncDays?: number;
    analysisThreshold?: number;
    profileViewTracking?: boolean;

    // Data
    reminders?: AppReminder[];
    notifications?: Record<string, AppNotification> | AppNotification[]; // Notifications are sometimes stored as array or map based on legacy
    conversations?: Record<string, AppConversation>;

    // State
    isAnalyzing?: boolean;
    lastSyncTimestamp?: number;

    // Logs
    analysisLogs?: AiAnalysisLog[];
}
