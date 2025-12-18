import { useQuery, useMutation } from '@tanstack/react-query'
import { extension } from '../api/extension'
import { queryClient } from '../lib/queryClient'
import { StorageSchema, AppNotification, AppConversation } from '../types/storage'

export interface FollowupItem extends AppNotification {
    // UI-specific computed properties can go here (or we can just reuse AppNotification)
}

export function useFollowups() {
    const { data: items = [], isLoading: loading } = useQuery({
        queryKey: ['followups'],
        queryFn: async () => {
            const data = await extension.storage.get<StorageSchema>(['conversations', 'notifications'])
            const notifications = (data.notifications || {}) as Record<string, AppNotification>
            const convs = (data.conversations || {}) as Record<string, AppConversation>

            return Object.values(notifications).map((n) => {
                const c = convs[n.conversationId] || {}
                const name = n.name || c.name || "Unknown";
                const id = n.conversationId;

                // improved URL resolution
                let threadUrl = "https://www.linkedin.com/messaging/"; // Default

                // 1. Explicit Thread URL (Highest Priority)
                if (c.url && c.url.includes('/messaging/thread/')) {
                    threadUrl = c.url;
                }
                else if (n.url && n.url.includes('/messaging/thread/')) {
                    threadUrl = n.url;
                }
                // 2. Verified Conversation URN (starts with '2-')
                else if (id && String(id).startsWith('2-')) {
                    threadUrl = `https://www.linkedin.com/messaging/thread/${id}/`;
                }
                // 3. Profile URL (Fallback per user request: "use URN to open profile")
                else if (c.url && c.url.includes('/in/')) {
                    threadUrl = c.url;
                }
                else if (n.url && n.url.includes('/in/')) {
                    threadUrl = n.url;
                }
                // 4. Name Search (Last Resort)
                else if (name && name !== "Unknown") {
                    threadUrl = `https://www.linkedin.com/messaging/?searchTerm=${encodeURIComponent(name)}`;
                }

                return {
                    id: n.id, // Notification ID (AppNotification)
                    conversationId: n.conversationId, // AppNotification
                    name: name,
                    reason: n.reason || n.aiReason || "Follow-up suggested",
                    category: n.category || n.aiCategory || "Follow-up",
                    aiSampleMessage: n.aiSampleMessage || n.sampleMessage,
                    timestamp: n.timestamp,
                    url: threadUrl
                } as FollowupItem
            }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        }
    })

    const dismissMutation = useMutation({
        mutationFn: async (id: string) => {
            await extension.runtime.sendMessage({ type: 'DISMISS_CONVERSATION', id })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['followups'] })
        }
    })

    const saveReminderMutation = useMutation({
        mutationFn: async ({ item, text, date }: { item: FollowupItem, text: string, date: string }) => {
            if (!text.trim()) return

            let dueDate = Date.now()
            if (date) {
                dueDate = new Date(date + 'T12:00:00').getTime()
            }

            const payload = {
                id: crypto.randomUUID(),
                conversationId: item.conversationId,
                conversationName: item.name,
                text: text,
                dueDate: dueDate,
                url: item.url,
                createdDate: Date.now(),
                source: 'followup_action',
                status: 'pending'
            }

            await extension.runtime.sendMessage({ type: 'ADD_REMINDER', data: payload })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reminders'] }) // Invalidate due to cross-effect
        }
    })

    const analyzeSavedMutation = useMutation({
        mutationFn: async () => {
            await extension.runtime.sendMessage({ type: 'ANALYZE_SAVED' })
        }
    })

    const openChat = (url?: string) => {
        extension.tabs.openSmart(url || "https://www.linkedin.com/messaging/")
    }

    return {
        items,
        loading,
        dismiss: (id: string) => dismissMutation.mutate(id),
        saveReminder: (item: FollowupItem, text: string, date: string) => saveReminderMutation.mutate({ item, text, date }),
        analyzeSaved: () => analyzeSavedMutation.mutate(),
        openChat
    }
}
