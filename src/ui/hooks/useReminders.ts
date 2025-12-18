import { useQuery, useMutation } from '@tanstack/react-query'
import { extension } from '../api/extension'
import { queryClient } from '../lib/queryClient'

import { AppReminder, StorageSchema, AppConversation } from '../types/storage'

export interface ReminderItem extends AppReminder {
    conversationName: string
}

export function useReminders() {
    const { data: reminders = [], isLoading: loading } = useQuery({
        queryKey: ['reminders'],
        queryFn: async () => {
            const data = await extension.storage.get<StorageSchema>(['reminders', 'conversations'])
            const rawReminders: AppReminder[] = data.reminders || []
            const convs = (data.conversations || {}) as Record<string, AppConversation>

            return rawReminders
                .filter((r) => r.status !== 'done')
                .map((r) => ({
                    ...r,
                    conversationName: convs[r.conversationId]?.name || r.conversationName || "Unknown"
                }))
                .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0)) as ReminderItem[]
        }
    })

    const dismissMutation = useMutation({
        mutationFn: async ({ id, conversationId }: { id: string, conversationId: string }) => {
            await extension.runtime.sendMessage({
                type: 'DISMISS_REMINDER',
                reminderId: id,
                conversationId
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reminders'] })
        }
    })

    const saveManualMutation = useMutation({
        mutationFn: async ({ text, date, url }: { text: string, date: string, url: string }) => {
            if (!text.trim()) return

            let dueDate = null
            if (date) {
                dueDate = new Date(date + 'T12:00:00').getTime()
            } else {
                dueDate = Date.now()
            }

            const payload = {
                id: crypto.randomUUID(),
                conversationId: 'manual',
                conversationName: "Manual Task",
                text: text,
                dueDate: dueDate,
                url: url,
                createdDate: Date.now(),
                source: 'user_manual',
                status: 'pending'
            }

            await extension.runtime.sendMessage({ type: 'ADD_REMINDER', data: payload })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reminders'] })
        }
    })

    const openLink = (url?: string, conversationId?: string) => {
        if (url) {
            extension.tabs.openSmart(url)
        } else if (conversationId && conversationId !== 'manual') {
            extension.tabs.openSmart(`https://www.linkedin.com/messaging/thread/${conversationId}/`)
        }
    }

    // Split logic
    const todayStr = new Date().toDateString()
    const now = new Date()

    const todayItems: ReminderItem[] = []
    const upcomingItems: ReminderItem[] = []

    reminders.forEach(r => {
        if (!r.dueDate) {
            upcomingItems.push(r)
            return
        }
        const d = new Date(r.dueDate)
        if (d.toDateString() === todayStr || d < now) {
            todayItems.push(r)
        } else {
            upcomingItems.push(r)
        }
    })

    return {
        loading,
        todayItems,
        upcomingItems,
        allReminders: reminders,
        dismiss: (id: string, conversationId: string) => dismissMutation.mutate({ id, conversationId }),
        saveManual: (text: string, date: string, url: string) => saveManualMutation.mutate({ text, date, url }),
        openLink
    }
}
