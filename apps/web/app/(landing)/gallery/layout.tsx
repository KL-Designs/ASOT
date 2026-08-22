import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Gallery | Australian Special Operations Taskforce',
    description: 'Photos and screenshots from Australian Special Operations Taskforce operations, training, and community events.',
}

/**
 * No `Container` here any more.
 *
 * Container's job is the standard page banner — a photograph with the page name
 * centred on it — and the gallery now carries its own, which does the same work
 * at half the height while also holding the archive's figures and the monthly
 * winner. Keeping both would have printed "GALLERY" twice, one under the other.
 *
 * The page also runs edge-to-edge on purpose: the featured strip's overflow off
 * the right of the viewport is what tells you it scrolls, and Container's fixed
 * gutters would have boxed that in.
 */
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <>{children}</>
}
