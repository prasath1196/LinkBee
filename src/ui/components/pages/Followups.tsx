
import { useState } from 'react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ListSkeleton } from '../ui/loader'
import { useFollowups } from '../../hooks/useFollowups'
import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

export function Followups() {
    const { items, loading, dismiss, saveReminder, openChat, analyzeSaved } = useFollowups()

    // Reminder Form State (Keep UI state local)
    const [activeReminderId, setActiveReminderId] = useState<string | null>(null)
    const [reminderText, setReminderText] = useState('')
    const [reminderDate, setReminderDate] = useState('')

    const toggleReminder = (id: string) => {
        if (activeReminderId === id) {
            setActiveReminderId(null)
            setReminderText('')
            setReminderDate('')
        } else {
            setActiveReminderId(id)
            setReminderText('')
            setReminderDate('')
        }
    }

    const handleSave = async (item: any) => {
        await saveReminder(item, reminderText, reminderDate)
        setActiveReminderId(null)
        setReminderText('')
        setReminderDate('')
    }

    return (
        <TooltipProvider>
            <div className="space-y-4 pb-4">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-sm font-semibold text-muted-foreground">Action Items</h2>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => analyzeSaved()}
                        className="h-7 text-xs gap-1"
                        title="Manually trigger AI analysis"
                    >
                        ✨ Analyze Saved
                    </Button>
                </div>

                {loading ? (
                    <ListSkeleton />
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center h-48 border rounded-lg border-dashed">
                        <div className="text-4xl mb-4">👋</div>
                        <h3 className="text-lg font-semibold">No Follow-ups Found</h3>
                        <p className="text-sm text-muted-foreground">Sync to scan your LinkedIn messages.</p>
                    </div>
                ) : (
                    items.map(item => (
                        <Card key={item.id} className="overflow-hidden">
                            <CardContent className="p-4 space-y-3">
                                {/* Header */}
                                <div className="flex justify-between items-start">
                                    <h3 className="font-semibold text-sm truncate pr-2">{item.name}</h3>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-primary"
                                            onClick={() => toggleReminder(item.id)}
                                            title="Set Reminder"
                                        >
                                            🔔
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                                            onClick={() => dismiss(item.conversationId)}
                                            title="Mark Done"
                                        >
                                            ✓
                                        </Button>
                                    </div>
                                </div>

                                {/* Message Box */}
                                <div className="bg-muted/50 p-3 rounded-md border text-sm italic text-muted-foreground">
                                    "{item.aiSampleMessage || "No sample message generated."}"
                                </div>

                                {/* Inline Reminder Form */}
                                {activeReminderId === item.id && (
                                    <div className="bg-background rounded-md border p-3 shadow-sm animate-in slide-in-from-top-2">
                                        <div className="space-y-2">
                                            <Input
                                                placeholder="Note..."
                                                className="h-8 text-xs"
                                                value={reminderText}
                                                onChange={e => setReminderText(e.target.value)}
                                                autoFocus
                                            />
                                            <div className="flex gap-2">
                                                <Input
                                                    type="date"
                                                    className="h-8 text-xs flex-1"
                                                    value={reminderDate}
                                                    onChange={e => setReminderDate(e.target.value)}
                                                />
                                                <Button
                                                    size="sm"
                                                    className="h-8 text-xs"
                                                    onClick={() => handleSave(item)}
                                                >
                                                    Save
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Footer Actions */}
                                <div className="flex justify-between items-center pt-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                                            {item.category}
                                        </span>
                                        {item.reason && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Info className="h-4 w-4 text-muted-foreground cursor-help opacity-70 hover:opacity-100" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="max-w-xs">{item.reason}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => {
                                                navigator.clipboard.writeText(item.aiSampleMessage || "")
                                            }}
                                        >
                                            Copy
                                        </Button>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => openChat(item.url)}
                                        >
                                            Open Chat
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )))}
            </div>
        </TooltipProvider>
    )
}
