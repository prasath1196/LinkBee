import { useState, useEffect } from 'react'
import { Settings } from './components/pages/Settings'
import { Followups } from './components/pages/Followups'
import { Reminders } from './components/pages/Reminders'
import { Button } from './components/ui/button'
import { Spinner } from './components/ui/loader'
import { RotateCw, Settings as SettingsIcon } from 'lucide-react'
import { ModeToggle } from './components/mode-toggle'
import { extension } from './api/extension'
import { queryClient } from './lib/queryClient'

function App() {
    const [activeTab, setActiveTab] = useState('followups')
    const [view, setView] = useState<'main' | 'settings'>('main')
    const [syncing, setSyncing] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)

    // Sync Storage changes + Listen for Analysis State
    useEffect(() => {
        // Initial fetch for analysis state
        extension.storage.get('isAnalyzing').then(data => setIsAnalyzing(!!data.isAnalyzing))

        const removeListener = extension.storage.onChanged((changes, area) => {
            if (area === 'local') {
                if (changes.isAnalyzing) {
                    setIsAnalyzing(!!changes.isAnalyzing.newValue)
                }
                if (changes.notifications || changes.conversations) {
                    queryClient.invalidateQueries({ queryKey: ['followups'] })
                }
                if (changes.reminders || changes.conversations) {
                    queryClient.invalidateQueries({ queryKey: ['reminders'] })
                }
                if (changes.apiKey || changes.aiProvider || changes.syncDays) {
                    queryClient.invalidateQueries({ queryKey: ['settings'] })
                }
            }
        })
        return () => removeListener()
    }, [])

    const handleSync = async () => {
        setSyncing(true)
        try {
            await extension.runtime.sendMessage({ action: 'FORCE_SCAN' })
            setTimeout(() => setSyncing(false), 2000)
        } catch (e) {
            console.error("Sync failed", e)
            setSyncing(false)
        }
    }

    if (view === 'settings') {
        return (
            <div className="w-[400px] min-h-[500px] p-4 bg-background text-foreground">
                <Settings onBack={() => setView('main')} />
            </div>
        )
    }

    return (
        <div className="w-full min-h-screen p-4 font-sans bg-background text-foreground">
            <header className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        LinkBee 🐝
                        {isAnalyzing && (
                            <span className="text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                <Spinner className="h-3 w-3" /> Analyzing...
                            </span>
                        )}
                    </h1>
                    <div className="flex gap-1">
                        <ModeToggle />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setView('settings')}
                            title="Settings"
                        >
                            <SettingsIcon className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing || isAnalyzing}
                    className="w-full flex justify-center gap-2"
                >
                    <RotateCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? 'Syncing...' : 'Sync Messages'}
                </Button>
            </header>

            <div className="flex gap-2 mb-4 border-b">
                <button
                    className={`px - 4 py - 2 text - sm font - medium transition - colors hover: text - primary ${activeTab === 'followups' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'} `}
                    onClick={() => setActiveTab('followups')}
                >
                    Follow-ups
                </button>
                <button
                    className={`px - 4 py - 2 text - sm font - medium transition - colors hover: text - primary ${activeTab === 'reminders' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'} `}
                    onClick={() => setActiveTab('reminders')}
                >
                    Reminders
                </button>
            </div>

            <main className="min-h-[300px]">
                {activeTab === 'followups' && <Followups />}

                {activeTab === 'reminders' && <Reminders />}
            </main>
        </div>
    )
}

export default App
