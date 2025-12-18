
import { useState } from 'react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ListSkeleton } from '../ui/loader'
import { useReminders, ReminderItem } from '../../hooks/useReminders'

export function Reminders() {
    const { loading, todayItems, upcomingItems, allReminders, dismiss, saveManual, openLink } = useReminders()
    const [showForm, setShowForm] = useState(false)

    // Form State
    const [newText, setNewText] = useState('')
    const [newDate, setNewDate] = useState('')
    const [newUrl, setNewUrl] = useState('')

    const handleSave = async () => {
        await saveManual(newText, newDate, newUrl)
        setNewText('')
        setNewDate('')
        setNewUrl('')
        setShowForm(false)
    }

    if (loading) return <ListSkeleton />

    return (
        <div className="space-y-6 pb-4">
            {/* Create Button */}
            <Button className="w-full" onClick={() => setShowForm(!showForm)}>
                {showForm ? 'Cancel' : '+ New Reminder'}
            </Button>

            {/* Manual Form */}
            {showForm && (
                <Card className="bg-muted/30 border-dashed">
                    <CardContent className="p-4 space-y-3">
                        <Input
                            placeholder="What to remind?"
                            value={newText}
                            onChange={e => setNewText(e.target.value)}
                        />
                        <Input
                            placeholder="Optional URL"
                            value={newUrl}
                            onChange={e => setNewUrl(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <Input
                                type="date"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                            />
                            <Button onClick={handleSave}>Save</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Empty State */}
            {allReminders.length === 0 && !showForm && (
                <div className="text-center p-8 text-muted-foreground">
                    <div className="text-4xl mb-2">⏰</div>
                    <p>All caught up!</p>
                </div>
            )}

            {/* Today Section */}
            {todayItems.length > 0 && (
                <div className="space-y-3">
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Due Today</h2>
                    {todayItems.map(item => (
                        <ReminderCard
                            key={item.id}
                            item={item}
                            onDismiss={dismiss}
                            onOpen={openLink}
                        />
                    ))}
                </div>
            )}

            {/* Upcoming Section */}
            {upcomingItems.length > 0 && (
                <div className="space-y-3">
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Upcoming</h2>
                    {upcomingItems.map(item => (
                        <ReminderCard
                            key={item.id}
                            item={item}
                            onDismiss={dismiss}
                            onOpen={openLink}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function ReminderCard({ item, onDismiss, onOpen }: {
    item: ReminderItem,
    onDismiss: (id: string, cid: string) => void,
    onOpen: (url?: string, cid?: string) => void
}) {
    const dateStr = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No date'
    const hasLink = item.url || (item.conversationId && item.conversationId !== 'manual')

    return (
        <Card>
            <CardContent className="p-3">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h3 className="font-semibold text-sm">{item.conversationName || 'Reminder'}</h3>
                        <p className="text-xs text-muted-foreground">Due: {dateStr}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => onDismiss(item.id, item.conversationId)}
                        title="Mark Done"
                    >
                        ✓
                    </Button>
                </div>

                <p className="text-sm mb-3">🔔 {item.text}</p>

                {hasLink && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => onOpen(item.url, item.conversationId)}
                    >
                        Go to Link
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}
