import type { Metadata } from 'next'

export const metadata: Metadata = {
    openGraph: { images: [] },
    twitter: { images: [] },
}

/**
 * No `loading.tsx` beside this file, deliberately.
 *
 * Each section of the file is its own route, so a Suspense boundary here fires
 * on every tab switch — swapping the whole profile for a full-screen loader and
 * back, twice a click. Without one, Next keeps the current section on screen
 * until the next is ready, which at the 0.3-0.6s this page renders in reads as
 * a normal navigation rather than a page reload.
 *
 * The better fix is to lift the hero and tab strip into this layout so only the
 * section below them swaps; a boundary could then live with the sections and
 * cover just that region. That needs `MilpacFile` split in two first.
 */
export default function MilpacProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <>{children}</>
}
