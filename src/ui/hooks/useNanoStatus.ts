import { useCallback, useEffect, useState } from 'react'
import { NANO_OPTIONS, localAvailability } from '../../utils/nano.js'

declare const LanguageModel: any

export type NanoStatus = 'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable'

export function useNanoStatus() {
    const [status, setStatus] = useState<NanoStatus>('checking')
    const [progress, setProgress] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const check = useCallback(async () => {
        if (typeof LanguageModel === 'undefined') {
            setStatus('unavailable')
            return
        }
        const result = await localAvailability()
        setStatus(result as NanoStatus)
    }, [])

    useEffect(() => {
        check()
    }, [check])

    // Must be called from a click handler: model download requires user activation.
    const enable = useCallback(async () => {
        if (typeof LanguageModel === 'undefined') {
            setStatus('unavailable')
            return
        }
        setError(null)
        setProgress(0)
        setStatus('downloading')
        try {
            const session = await LanguageModel.create({
                ...NANO_OPTIONS,
                monitor(m: any) {
                    m.addEventListener('downloadprogress', (e: any) => {
                        setProgress(Math.round(e.loaded * 100))
                    })
                }
            })
            session.destroy()
        } catch (e: any) {
            setError(e?.message || String(e))
        } finally {
            setProgress(null)
            await check()
        }
    }, [check])

    return { status, progress, error, enable }
}
