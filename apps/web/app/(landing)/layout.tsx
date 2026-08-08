import type { Metadata } from 'next'

export const metadata: Metadata = {
    openGraph: {
        images: '/meta_banner.png',
    },
    twitter: {
        images: '/meta_banner.png',
    },
}

export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <>
            {children}
        </>
    )
}
