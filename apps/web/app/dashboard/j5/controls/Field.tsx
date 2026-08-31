'use client'

import { useId } from 'react'
import f from '@/styles/j5-fields.module.css'

/**
 * A text input in the console's language: mono eyebrow above a hard-edged box.
 *
 * Replaces MUI's outlined TextField on the J5 tabs. The label sits above the
 * border rather than notched through it — MUI's notch is what forces the
 * rounded corner, and the corner is what made the toolbar look like a
 * different application from the dashboard around it.
 */

export function Field({ label, value, onChange, placeholder, type = 'text', prefix, clearable, error, disabled, autoFocus, onKeyDown, onBlur, className }: {
    label?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    type?: 'text' | 'search' | 'url' | 'number'
    /** Mono chrome inside the box, ahead of the value — a glyph or a unit. */
    prefix?: string
    clearable?: boolean
    error?: string
    disabled?: boolean
    autoFocus?: boolean
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
    onBlur?: () => void
    className?: string
}) {
    const id = useId()

    return (
        <div className={`${f.field} ${className ?? ''}`}>
            {label && <label className={f.label} htmlFor={id}>{label}</label>}
            <div className={`${f.surface} ${error ? f.invalid : ''} ${disabled ? f.disabled : ''}`}>
                {prefix && <span className={f.affix} aria-hidden='true'>{prefix}</span>}
                <input
                    id={id}
                    className={f.input}
                    type={type}
                    value={value}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    aria-invalid={error ? true : undefined}
                    aria-errormessage={error ? `${id}-err` : undefined}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={onBlur}
                />
                {clearable && value !== '' && !disabled && (
                    <button
                        type='button'
                        className={f.clear}
                        /* Named for what it clears: a toolbar has four of these
                           and "Clear" alone is four identical buttons to a
                           screen reader. */
                        aria-label={label ? `Clear ${label.toLowerCase()}` : 'Clear'}
                        onClick={() => onChange('')}
                    >
                        &times;
                    </button>
                )}
            </div>
            {error && <span className={f.error} id={`${id}-err`}>{error}</span>}
        </div>
    )
}

/** The same box, grown for a caption or a note. */
export function TextArea({ label, value, onChange, placeholder, rows = 3, error, disabled, onBlur, className }: {
    label?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    rows?: number
    error?: string
    disabled?: boolean
    onBlur?: () => void
    className?: string
}) {
    const id = useId()

    return (
        <div className={`${f.field} ${className ?? ''}`}>
            {label && <label className={f.label} htmlFor={id}>{label}</label>}
            <div className={`${f.surface} ${f.surfaceMulti} ${error ? f.invalid : ''} ${disabled ? f.disabled : ''}`}>
                <textarea
                    id={id}
                    className={f.textarea}
                    value={value}
                    rows={rows}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    aria-errormessage={error ? `${id}-err` : undefined}
                    onChange={e => onChange(e.target.value)}
                    onBlur={onBlur}
                />
            </div>
            {error && <span className={f.error} id={`${id}-err`}>{error}</span>}
        </div>
    )
}
