
import { z } from 'zod';

// --- Core Data Structures ---

// Participant Schema (From API)
export const ParticipantSchema = z.object({
    name: z.string(),
    urn: z.string().optional(),
    headline: z.string().optional(),
    distance: z.string().optional(),
    imgUrl: z.string().optional(),
    isPremium: z.boolean().optional(),
});

export type Participant = z.infer<typeof ParticipantSchema>;

// History Item Schema (Stored in 'history' array)
export const HistoryItemSchema = z.object({
    sender: z.string(),
    text: z.string(),
    timestamp: z.number(),
    isMe: z.boolean(),
    dateHeader: z.string().optional()
});

export type HistoryItem = z.infer<typeof HistoryItemSchema>;

// Stored Conversation Schema (Matches User's Actual Storage)
// Note: Many fields are optional to support legacy data vs new rich data.
export const StoredConversationSchema = z.object({
    // Identity
    id: z.string(), // Key used in storage (e.g. ACoAA... or 2-...)
    urn: z.string().optional(), // Raw URN
    threadUrn: z.string().optional(), // Specific Thread ID

    // Basic Info
    name: z.string(), // Flattened name (Target)
    url: z.string().optional(),
    status: z.string().optional(), // 'active', 'archived', etc.

    // Content
    history: z.array(HistoryItemSchema).optional(),
    lastMessage: z.string().optional(),
    lastTimestamp: z.number().optional(),
    lastSenderIsMe: z.boolean().optional(),

    // Metadata (Rich)
    headline: z.string().optional(),
    networkDistance: z.string().optional(),
    imgUrl: z.string().optional(),
    isSponsored: z.boolean().optional(),
    isPremium: z.boolean().optional(),

    // AI Analysis Fields (Enriched)
    aiAnalysisDate: z.number().nullable().optional(),
    aiCategory: z.string().nullable().optional(),
    aiConfidence: z.number().nullable().optional(),
    aiLastDecision: z.string().nullable().optional(), // "YES", "NO"
    aiReason: z.string().nullable().optional(),
    aiSampleMessage: z.string().nullable().optional(),
    aiScenario: z.string().nullable().optional(),
    currentHash: z.string().optional(),
    needsAction: z.boolean().optional(),
    history_changed_since_analyzed: z.boolean().optional()
});

export type StoredConversation = z.infer<typeof StoredConversationSchema>;

// User Profile
export const UserProfileSchema = z.object({
    name: z.string(),
    urn: z.string().optional(),
    imgUrl: z.string().optional()
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// AI Analysis Log (Root Level Array)
export const AiAnalysisLogSchema = z.object({
    id: z.string().optional(),
    conversationId: z.string(),
    conversationName: z.string(),
    decision: z.string(), // "YES", "NO"
    reason: z.string().optional(),
    confidence: z.number().optional(),
    timestamp: z.number(),
    processingTime: z.number().optional(),
    triggerReason: z.string().optional(),
    // UI Nesting Support (Backwards Compat)
    provider: z.string().optional(),
    inputContext: z.object({
        daysSince: z.union([z.string(), z.number()]).optional(),
        historyLength: z.number().optional(),
        lastMessageSnippet: z.string().optional()
    }).optional(),
    outputResult: z.object({
        decision: z.string().optional(),
        confidence: z.number().optional(),
        category: z.string().optional(),
        scenario: z.string().optional(),
        reason: z.string().optional()
    }).optional()
});

export type AiAnalysisLog = z.infer<typeof AiAnalysisLogSchema>;

// Notification Schema
export const NotificationSchema = z.object({
    conversationId: z.string(),
    name: z.string(),
    status: z.string(),
    aiAnalysisDate: z.number().nullable().optional(),
    aiCategory: z.string().nullable().optional(),
    aiConfidence: z.number().nullable().optional(),
    aiLastDecision: z.string().nullable().optional(),
    aiReason: z.string().nullable().optional(),
    // UI Fields
    id: z.string().optional(),
    // conversationId already defined above
    reason: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    aiSampleMessage: z.string().nullable().optional(),

    urn: z.string().optional(),
    threadUrn: z.string().optional(),
    conversationName: z.string().optional(),
    message: z.string().optional(), // 'sampleMessage' or 'message'
    url: z.string().optional(),
    isRead: z.boolean().optional(),
    timestamp: z.number().optional()
});

export type Notification = z.infer<typeof NotificationSchema>;

// Settings Schema (Root Object)
export const SettingsSchema = z.object({
    aiProvider: z.string().optional(), // "gemini", "openai"
    apiKey: z.string().optional(),
    analysisThreshold: z.number().optional(),
    autoScan: z.boolean().optional(),
    profileViewTracking: z.boolean().optional(),

    // Legacy / Other
    daysToFetch: z.number().optional(),
    syncDays: z.number().optional(), // Alias for daysToFetch in UI
    analysisInterval: z.number().optional(),
    lastScanTimestamp: z.number().optional()
});

export type Settings = z.infer<typeof SettingsSchema>;

export type AiProvider = string; // Or union if strictly defined


// --- API Parser Types (Incoming Data) ---
// This represents the clean object output by api_parser.js BEFORE it hits storage.
export const IncomingConversationSchema = z.object({
    urn: z.string(),
    threadUrn: z.string(),
    title: z.string(),
    participants: z.array(ParticipantSchema),
    text: z.string().optional(),
    timestamp: z.number(),
    senderUrn: z.string().nullable().optional(),
    isSponsored: z.boolean().optional(),
    isDelta: z.boolean().optional(),
    headline: z.string().optional(),
    networkDistance: z.string().optional(),
    imgUrl: z.string().optional()
});

// Reminder Schema
export const ReminderSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    conversationName: z.string().optional(), // UI Field
    text: z.string(),
    dueDate: z.number().nullable(), // timestamp or null
    createdDate: z.number(),
    source: z.string().optional(), // 'ai' or 'manual'
    status: z.string().optional(), // 'pending', 'completed'
    url: z.string().optional() // UI Field
});

export type Reminder = z.infer<typeof ReminderSchema>;

// Profile View Schema
export const ProfileViewSchema = z.object({
    id: z.string(), // e.g. "ACoAA..." or "prasath-na" (vanity)
    name: z.string(),
    headline: z.string().optional(),
    imgUrl: z.string().optional(),
    timeStr: z.string().optional(), // "2h ago"
    scrapedAt: z.number(), // timestamp
    status: z.string().optional(), // 'new', 'viewed'
    aiStatus: z.string().optional(), // 'pending', 'done'
    aiMessage: z.string().optional(),
    analyzedAt: z.number().optional()
});

export type ProfileView = z.infer<typeof ProfileViewSchema>;

export type IncomingConversation = z.infer<typeof IncomingConversationSchema>;
