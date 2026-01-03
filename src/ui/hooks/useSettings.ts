import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { extension } from '../api/extension'
import { queryClient } from '../lib/queryClient'
import { Settings as BackendSettings, AiProvider } from '../../types/storage'

// Local Schema Definition for UI access
interface StorageSchema extends BackendSettings {
    // Add any UI-specific or legacy fields if strictly needed, otherwise mirrors BackendSettings
}

export interface Settings extends BackendSettings {
    autoScan: boolean // Legacy mapping or UI preference
}

export function useSettings() {
    const [localSettings, setLocalSettings] = useState<Settings>({
        apiKey: '',
        aiProvider: 'gemini',
        syncDays: 30,
        analysisThreshold: 24,
        autoScan: true
    })
    const [status, setStatus] = useState<string>('')

    useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const data = await extension.storage.get<StorageSchema>(['apiKey', 'aiProvider', 'syncDays', 'analysisThreshold', 'profileViewTracking'])
            const s: Settings = {
                apiKey: data.apiKey || '',
                aiProvider: data.aiProvider || 'gemini',
                syncDays: data.syncDays || 30,
                analysisThreshold: data.analysisThreshold || 24,
                autoScan: data.profileViewTracking !== false // Map profileViewTracking to autoScan
            }
            setLocalSettings(s)
            return s
        },
        staleTime: Infinity
    })

    const saveMutation = useMutation({
        mutationFn: async (newSettings: Settings) => {
            let days = newSettings.syncDays || 30
            if (days > 60) days = 60
            if (days < 1) days = 1

            const toSave: Partial<StorageSchema> = {
                apiKey: newSettings.apiKey?.trim(),
                aiProvider: newSettings.aiProvider as AiProvider,
                syncDays: days,
                analysisThreshold: newSettings.analysisThreshold,
                profileViewTracking: newSettings.autoScan // Map back
            }
            await extension.storage.set(toSave)
            return toSave
        },
        onSuccess: (data) => {
            queryClient.setQueryData(['settings'], data)
            setLocalSettings(prev => ({ ...prev, syncDays: data.syncDays }))
            setStatus('Settings Saved!')
            setTimeout(() => setStatus(''), 2000)
        }
    })

    const updateSettings = (partial: Partial<Settings>) => {
        setLocalSettings(prev => ({ ...prev, ...partial }))
    }

    const save = async () => {
        if (!localSettings.apiKey?.trim()) {
            setStatus('Error: API Key is required')
            return
        }
        saveMutation.mutate(localSettings)
    }

    return {
        settings: localSettings,
        status,
        updateSettings,
        save
    }
}
