import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MapWorld } from '@/components/operations/map/types'

function countSatTiles(worldDir: string): number {
    const satDir = join(worldDir, 'sat')
    if (!existsSync(satDir)) return 0
    // Count subdirectories in sat/ — each is a column (0, 1, 2, …)
    return readdirSync(satDir, { withFileTypes: true }).filter(e => e.isDirectory()).length
}

export function getAvailableWorlds(): MapWorld[] {
    const mapsDir = join(process.cwd(), 'public', 'maps')
    if (!existsSync(mapsDir)) return []

    const worlds: MapWorld[] = []
    for (const entry of readdirSync(mapsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const worldDir = join(mapsDir, entry.name)
        const satTiles = countSatTiles(worldDir)
        if (satTiles === 0) continue  // no sat tiles = not a usable world

        const metaPath = join(worldDir, 'meta.json')
        let displayName = entry.name
        let worldSize = 10240
        if (existsSync(metaPath)) {
            try {
                const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
                displayName = meta.displayName || entry.name
                worldSize = meta.worldSize || 10240
            } catch {}
        }
        worlds.push({ name: entry.name, displayName, worldSize, satTiles })
    }
    return worlds
}
