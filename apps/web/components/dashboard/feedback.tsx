'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Button, Input } from './controls'
import { Check, Warning } from './icons'
import s from '@/styles/dashboard.module.css'

/* ============================================================================
   Feedback: confirmation, toast, save bar.
   ========================================================================== */

/**
 * The friction a destructive action needs.
 *
 * `confirmWord` demands the word be typed before the button enables. Use it
 * whenever the action cannot be undone; leave it off for one that can (removing
 * someone from a department roster is a Tuesday, discharging them is not).
 */
export function ConfirmDialog({
    open, title, children, warning, confirmWord, confirmLabel = 'Confirm', onConfirm, onCancel,
}: {
    open: boolean
    title: React.ReactNode
    children: React.ReactNode
    /** The consequence, stated plainly. Rendered in the red box. */
    warning?: React.ReactNode
    confirmWord?: string
    confirmLabel?: string
    onConfirm: () => void
    onCancel: () => void
}) {
    const [typed, setTyped] = useState('')
    const input = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!open) return
        setTyped('')
        const t = setTimeout(() => input.current?.focus(), 60)

        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
        document.addEventListener('keydown', onKey)

        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            clearTimeout(t)
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = previous
        }
    }, [open, onCancel])

    if (!open) return null

    const ready = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase()

    return (
        <div className={s.scrim} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
            <div className={s.dialog} role='alertdialog' aria-modal='true'>
                <div className={s.dialogH}>
                    <span className={s.ic}><Warning /></span>
                    <span><span className={s.t}>{title}</span></span>
                </div>

                <div className={s.dialogB}>
                    {children}
                    {warning && <div className={s.warn}>{warning}</div>}
                    {confirmWord && (
                        <>
                            <div className={s.warn}>Type <b>{confirmWord}</b> to confirm</div>
                            <Input
                                ref={input}
                                value={typed}
                                placeholder={confirmWord}
                                onChange={e => setTyped(e.target.value)}
                                style={{ marginTop: 10 }}
                                aria-label={`Type ${confirmWord} to confirm`}
                            />
                        </>
                    )}
                </div>

                <div className={s.dialogF}>
                    <Button variant='subtle' onClick={onCancel}>Cancel</Button>
                    <Button variant='danger' disabled={!ready} onClick={onConfirm}>{confirmLabel}</Button>
                </div>
            </div>
        </div>
    )
}

/* ---------- toast --------------------------------------------------------- */

type Toast = { message: string, tone: 'ok' | 'error' }

const ToastContext = createContext<(message: string, tone?: 'ok' | 'error') => void>(() => { })

/** `const toast = useToast(); toast('Member record saved')` */
export const useToast = () => useContext(ToastContext)

/**
 * Wraps the dashboard shell. One toast at a time on purpose — a stack of them
 * is a log, and the dashboard already has one of those.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toast, setToast] = useState<Toast | null>(null)
    const [shown, setShown] = useState(false)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    const push = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
        timers.current.forEach(clearTimeout)
        timers.current = []
        setToast({ message, tone })
        setShown(true)
        timers.current.push(setTimeout(() => setShown(false), 2600))
        // Held in the DOM until the slide-out finishes, then dropped.
        timers.current.push(setTimeout(() => setToast(null), 3000))
    }, [])

    useEffect(() => () => timers.current.forEach(clearTimeout), [])

    return (
        <ToastContext.Provider value={push}>
            {children}
            {toast && (
                <div
                    className={[s.toast, shown ? s.toastOn : '', toast.tone === 'error' ? s.toastErr : ''].filter(Boolean).join(' ')}
                    role='status'
                    aria-live='polite'
                >
                    {toast.tone === 'error' ? <Warning /> : <Check />}
                    <span>
                        <span className={s.t}>{toast.message}</span>
                        <span className={s.s}>Just now</span>
                    </span>
                </div>
            )}
        </ToastContext.Provider>
    )
}

/* ---------- save bar ------------------------------------------------------ */

/**
 * Appears once something is dirty, and says how much is pending.
 *
 * The member editor's SAVE CHANGES sits at the very top of a long scrolling
 * form: edit the promotion history at the bottom and the button is off-screen
 * with no indication anything is unsaved.
 */
export function SaveBar({ count, onSave, onDiscard, saving = false, className = '' }: {
    /** Pending changes. At zero the bar does not render. */
    count: number
    onSave: () => void
    onDiscard: () => void
    saving?: boolean
    /**
     * The bar bleeds to the edges of its column by a negative `--gap` margin.
     * A form padded by something other than `--gap` passes its own margins here
     * — sticky only works on a direct child of the scrolling column, so this
     * cannot be fixed with a wrapper.
     */
    className?: string
}) {
    if (count === 0) return null
    return (
        <div className={`${s.savebar} ${className}`}>
            <span className={s.s}>
                <Warning /> {count} unsaved change{count === 1 ? '' : 's'}
            </span>
            <span className={s.r}>
                <Button variant='subtle' onClick={onDiscard} disabled={saving}>Discard</Button>
                <Button variant='primary' onClick={onSave} disabled={saving}>
                    <Check /> {saving ? 'Saving…' : 'Save changes'}
                </Button>
            </span>
        </div>
    )
}
