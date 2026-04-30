import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MapWorld } from '@/components/operations/map/types'

function countSatTiles(worldDir: string): number {
    const satDir = join(worldDir, 'sat')
    if (!existsSync(satDir)) return 0
    return readdirSync(satDir, { withFileTypes: true }).filter(e => e.isDirectory()).length
}

export function getAvailableWorlds(): MapWorld[] {
    const mapsDir = join(process.cwd(), 'maps')
    if (!existsSync(mapsDir)) return []

    const worlds: MapWorld[] = []
    for (const entry of readdirSync(mapsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const worldDir = join(mapsDir, entry.name)
        const satTiles = countSatTiles(worldDir)
        if (satTiles === 0) continue

        const hasGeoJSON    = existsSync(join(worldDir, 'geojson'))
        const hasTerrain    = existsSync(join(worldDir, 'terrain.png'))
        const hasCoastline  = existsSync(join(worldDir, 'coastline.png'))
        const hasContours   = existsSync(join(worldDir, 'contours.geojson.gz'))
        const hasPreview    = existsSync(join(worldDir, 'preview.jpg'))

        const metaPath = join(worldDir, 'meta.json')
        let displayName = entry.name
        let worldSize = 10240
        let colorOutside: [number, number, number, number] | undefined
        if (existsSync(metaPath)) {
            try {
                const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
                displayName = meta.displayName || entry.name
                worldSize = meta.worldSize || 10240
                if (Array.isArray(meta.colorOutside) && meta.colorOutside.length === 4) {
                    colorOutside = meta.colorOutside as [number, number, number, number]
                }
            } catch {}
        }
        worlds.push({ name: entry.name, displayName, worldSize, satTiles, hasGeoJSON, hasTerrain, hasCoastline, hasContours, hasPreview, colorOutside })
    }
    return worlds
}
