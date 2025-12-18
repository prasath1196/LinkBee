import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { useSettings } from '../../hooks/useSettings'

export function Settings({ onBack }: { onBack: () => void }) {
    const { settings, status, updateSettings, save } = useSettings()

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
                    <CardTitle>AI Configuration</CardTitle>
                    <CardDescription>Configure your AI provider.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="provider">AI Provider</Label>
                        <select
                            id="provider"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={settings.aiProvider}
                            onChange={e => updateSettings({ aiProvider: e.target.value as any })}
                        >
                            <option value="gemini">Google (Gemini 2.0 Flash)</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key</Label>
                        <Input
                            id="apiKey"
                            type="password"
                            value={settings.apiKey}
                            onChange={e => updateSettings({ apiKey: e.target.value })}
                            placeholder="sk-..."
                        />
                        <p className="text-xs text-muted-foreground">Stored locally in your browser.</p>
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
