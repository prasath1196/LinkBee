import { useCallback, useEffect, useState } from 'react'
import { NANO_OPTIONS, localAvailability } from '../../utils/nano.js'

declare const LanguageModel: any

export type NanoStatus = 'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable'

const POLL_INTERVAL_MS = 5000

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

    // Downloads happen in Chrome's background and progress events are unreliable,
    // so poll availability while downloading.
    useEffect(() => {
        if (status !== 'downloading') return
        let cancelled = false
        const id = setInterval(async () => {
            const result = await localAvailability()
            if (!cancelled) setStatus(result as NanoStatus)
        }, POLL_INTERVAL_MS)
        return () => {
            cancelled = true
            clearInterval(id)
        }
    }, [status])

    // Must be called from a click handler: model download requires user activation.
    // LanguageModel.create() is invoked synchronously (before any await) to keep activation.
    const enable = useCallback(() => {
        if (typeof LanguageModel === 'undefined') {
            setStatus('unavailable')
            return
        }
        setError(null)
        setProgress(null)
        setStatus('downloading')
        let createPromise: Promise<any>
        try {
            createPromise = LanguageModel.create({
                ...NANO_OPTIONS,
                monitor(m: any) {
                    m.addEventListener('downloadprogress', (e: any) => {
                        const pct = Math.round(e.loaded * 100)
                        setProgress(pct > 0 ? pct : null)
                    })
                }
            })
        } catch (e: any) {
            setError(e?.message || String(e))
            check()
            return
        }
        createPromise
            .then((session: any) => {
                try { session?.destroy?.() } catch { /* ignore */ }
                setProgress(null)
                return check()
            })
            .catch((e: any) => {
                setError(e?.message || String(e))
                return check()
            })
    }, [check])

    return { status, progress, error, enable, recheck: check }
}
