import Link from 'next/link'
import { rgbTriplet } from '@/lib/colour'
import { editHref } from './tabs'
import s from './mode-switch.module.css'

/**
 * The way back into the editor from the orders page — the mirror of the
 * editor's own "Preview" button, in the same corner and the same skin, so the
 * two read as one switch rather than two unrelated shortcuts.
 *
 * The Orders tab's menu can do this too, and deliberately: the menu is where
 * you go to *choose* a mode, and this is the one-click flip for somebody who is
 * already going back and forth. Rendered only for people who can edit.
 *
 * `.command` carries nothing but custom properties, so wearing it here just
 * resolves the palette — the accent is the operation's own theme colour.
 */
export default function EditOrdersButton({
    operationId, themeColor,
}: {
    operationId: string
    themeColor?: string
}) {
    const accent = themeColor || '#db001d'

    return (
        <Link
            href={editHref(operationId)}
            className={`command ${s.btn} ${s.fixed}`}
            style={{
                ['--acc' as string]: accent,
                ['--acc-rgb' as string]: rgbTriplet(accent),
            }}
            title='Open the orders in the editor'
        >
            ✎ Edit
        </Link>
    )
}
