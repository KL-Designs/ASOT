import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getAvailableWorlds } from '@/lib/maps'
import MapViewer from './MapViewer'

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
    const { name } = await params
    const world = getAvailableWorlds().find(w => w.name === name)
    if (!world) return {}
    return {
        title: `${world.displayName} | Interactive Map`,
        openGraph: {
            title: `${world.displayName} | Interactive Map`,
            images: world.hasPreview ? [`/maps/${world.name}/preview.png`] : [],
        },
    }
}

export default async function MapWorldPage({ params }: { params: Promise<{ name: string }> }) {
    const { name } = await params
    const world = getAvailableWorlds().find(w => w.name === name)
    if (!world) notFound()
    return <MapViewer world={world} />
}
