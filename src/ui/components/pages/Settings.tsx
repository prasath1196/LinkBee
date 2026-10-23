import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { useSettings } from '../../hooks/useSettings'
import { useNanoStatus } from '../../hooks/useNanoStatus'

export function Settings({ onBack }: { onBack: () => void }) {
    const { settings, status, updateSettings, save } = useSettings()
    const nano = useNanoStatus()

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
                <Button variant="ghost" size="icon" onClick={onBack}>
                    ←
                </Button>
                <h2 className="text-lg font-semibold">Settings</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>On-device AI (free)</CardTitle>
                    <CardDescription>Gemini Nano runs privately in Chrome to decide who needs a follow-up. No key, no cost.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {nano.status === 'checking' && <p className="text-sm text-muted-foreground">Checking…</p>}
                    {nano.status === 'available' && <p className="text-sm text-green-500">Ready ✓</p>}
                    {nano.status === 'downloadable' && (
                        <Button onClick={nano.enable} className="w-full">Enable on-device AI</Button>
                    )}
                    {nano.status === 'downloading' && (
                        <p className="text-sm text-muted-foreground">Downloading model… {nano.progress ?? 0}%</p>
                    )}
                    {nano.status === 'unavailable' && (
                        <p className="text-sm text-muted-foreground">
                            Not supported on this device (needs Chrome 138+, 22 GB free disk, and a 4 GB+ GPU or 16 GB RAM). Add a Gemini API key below instead.
                        </p>
                    )}
                    {nano.error && <p className="text-sm text-red-500">{nano.error}</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Gemini API key (optional)</CardTitle>
                    <CardDescription>Improves follow-up drafts. Required if on-device AI isn't supported.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key</Label>
                        <Input
                            id="apiKey"
                            type="password"
                            value={settings.apiKey}
                            onChange={e => updateSettings({ apiKey: e.target.value })}
                            placeholder="AIza..."
                        />
                        <p className="text-xs text-muted-foreground">
                            Stored locally in your browser.{' '}
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                            >
                                Get a key
                            </a>
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Scan Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="syncDays">Days to Fetch (Max 60)</Label>
                        <Input
                            id="syncDays"
                            type="number"
                            min={1}
                            max={60}
                            value={settings.syncDays}
                            onChange={e => updateSettings({ syncDays: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <Button onClick={save} className="w-full">Save Changes</Button>
                    {status && <p className={`text-center text-sm ${status.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>{status}</p>}
                </CardContent>
            </Card>
        </div>
    )
}
