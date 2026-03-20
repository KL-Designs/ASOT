import type { Metadata } from 'next'

export const metadata: Metadata = {
    openGraph: { images: [] },
    twitter: { images: [] },
}

export default function MilpacProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <>{children}</>
}
