'use client'

import { useRef, useState } from 'react'

export interface MetaFields {
    title: string
    department: string
    date: string
    loreDate: string
}

/**
 * Lifted from `scheduleSave` in page.tsx: same 1000ms debounce, same
 * `GET /api/operations/update?id=<id>&<key>=<encoded value>` call, same
 * saved/saving/unsaved transitions. Additionally records when the save
 * landed so the status bar can show it.
 */
export function useOperationMeta(operationId: string, initial: MetaFields): {
    meta: MetaFields
    setField: (k: keyof MetaFields, v: string) => void
    saveStatus: 'saved' | 'saving' | 'unsaved'
    savedAt: Date | null
} {
    const [meta, setMeta] = useState<MetaFields>(initial)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
    const [savedAt, setSavedAt] = useState<Date | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    function setField(key: keyof MetaFields, value: string) {
        setMeta(m => ({ ...m, [key]: value }))
        setSaveStatus('unsaved')
        clearTimeout(timer.current)
        timer.current = setTimeout(async () => {
            setSaveStatus('saving')
            const qs = `${key}=${encodeURIComponent(value)}`
            try {
                await fetch(`/api/operations/update?id=${operationId}&${qs}`)
                setSaveStatus('saved')
                setSavedAt(new Date())
            } catch {
                setSaveStatus('unsaved')
            }
        }, 1000)
    }

    return { meta, setField, saveStatus, savedAt }
}
