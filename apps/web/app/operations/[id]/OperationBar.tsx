import Link from 'next/link'
import { rgbTriplet } from '@/lib/colour'
import OperationTabs from './OperationTabs'
import type { OperationTab } from './tabs'

interface Props {
    operationId: string
    title: string
    /** Upcoming / Active / Completed / In Development. */
    status?: string
    themeColor?: string
    active: OperationTab
    canEdit: boolean
    /** True on the editor's own route — flips the ribbon to the way out. */
    editing?: boolean
    /** Came in from the J2 operations tab; the back link should go back there. */
    fromJ2?: boolean
}

const STATUS_COLOR: Record<string, string> = {
    'Active': 'var(--good)',
    'Upcoming': 'var(--warn)',
    'Completed': 'var(--ink-3)',
    'In Development': 'var(--crit)',
}

/**
 * The slim bar over the public orders page.
 *
 * Deliberately not the editor's header. It carries what a reader needs — where
 * they are, what the operation is called, what state it is in, and the four
 * views — and none of what an author needs: no save state, no Publish, no
 * delete menu. Those belong to a person who has opened the editor, and putting
 * them on a page every member can read would be showing controls that either do
 * nothing or should not be there.
 *
 * The tab strip itself is the same component the editor's header renders, so a
 * reader and an author see the same four names in the same order rather than
 * two lists that drift.
 */
export default function OperationBar({
    operationId, title, status, themeColor, active, canEdit, editing = false, fromJ2 = false,
}: Props) {
    const accent = themeColor || '#db001d'
    const statusColor = (status && STATUS_COLOR[status]) || 'var(--ink-3)'

    return (
        <div
            className='command'
            style={{
                ['--acc' as string]: accent,
                ['--acc-rgb' as string]: rgbTriplet(accent),
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '0 16px', height: 52, flexShrink: 0,
                borderBottom: '1px solid var(--line)',
                background: 'var(--s1)',
                fontFamily: 'var(--sans)',
                // Not `overflow: hidden`: the edit ribbon hangs below this box.
                position: 'relative', zIndex: 20,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 1 }}>
                <Link
                    href={fromJ2 ? '/dashboard/j2' : '/operations'}
                    style={{
                        fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em',
                        textTransform: 'uppercase', color: 'var(--ink-3)',
                        textDecoration: 'none', flexShrink: 0,
                    }}
                >
                    {fromJ2 ? '← J2 Operations' : '← Back'}
                </Link>

                <div style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0 }} />

                <span style={{
                    // Display-only caps, matching the editor's header — the name
                    // is stored in whatever case the author typed.
                    fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'var(--ink)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {title || 'Untitled Operation'}
                </span>

                {status && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: statusColor,
                        border: `1px solid ${statusColor}`, borderRadius: 'var(--r)',
                        padding: '2px 8px',
                    }}>
                        {status}
                    </span>
                )}
            </div>

            <div style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0 }} />

            <OperationTabs
                operationId={operationId}
                active={active}
                canEdit={canEdit}
                editing={editing}
            />

            <div style={{ flex: 1, minWidth: 0 }} />
        </div>
    )
}
