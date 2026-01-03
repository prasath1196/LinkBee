// Define a loose schema for local API inference if needed, or alias Settings
// Actually, StorageSchema in extension.ts was an interface that included everything (Settings, Data, Logs).
// I should define an interface that resembles the old StorageSchema roughly, or import partials.
// But strict typing here might be tricky if I don't import everything.
// Let's import all and composite them.
import { Settings as BackendSettings, StoredConversation, Notification, Reminder, AiAnalysisLog } from '../../types/storage';

export interface StorageSchema extends BackendSettings {
    conversations?: Record<string, StoredConversation>;
    notifications?: Record<string, Notification> | Notification[];
    reminders?: Reminder[];
    analysisLogs?: AiAnalysisLog[];
    // State
    isAnalyzing?: boolean;
    lastSyncTimestamp?: number;
}

export const extension = {
    storage: {
        get: <T = StorageSchema>(keys: string | string[]) => new Promise<T>((resolve) => {
            chrome.storage.local.get(keys, (data) => resolve(data as T));
        }),
        set: (items: Partial<StorageSchema>) => new Promise<void>((resolve) => {
            chrome.storage.local.set(items, () => resolve());
        }),
        onChanged: (callback: (changes: any, area: string) => void) => {
            const listener = (changes: any, area: string) => callback(changes, area);
            chrome.storage.onChanged.addListener(listener);
            return () => chrome.storage.onChanged.removeListener(listener);
        }
    },
    runtime: {
        sendMessage: (message: any) => new Promise<any>((resolve) => {
            chrome.runtime.sendMessage(message, (response) => resolve(response));
        })
    },
    tabs: {
        create: (url: string) => chrome.tabs.create({ url }),
        openSmart: (url: string) => new Promise<void>((resolve) => {
            // Check for existing LinkedIn messaging tabs
            const targetPattern = "*://www.linkedin.com/messaging/*";
            chrome.tabs.query({ url: targetPattern }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const existingTab = tabs[0];
                    if (existingTab.id) {
                        chrome.tabs.update(existingTab.id, { url: url, active: true });
                        chrome.windows.update(existingTab.windowId, { focused: true });
                        resolve();
                        return;
                    }
                }
                // Fallback: Create new tab
                chrome.tabs.create({ url });
                resolve();
            });
        })
    }
};
