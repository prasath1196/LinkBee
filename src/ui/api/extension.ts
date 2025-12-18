import { StorageSchema } from '../types/storage';

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
