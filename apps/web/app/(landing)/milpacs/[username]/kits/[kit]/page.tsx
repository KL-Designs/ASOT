import { MilpacFile } from '../../milpac-file'

export { generateMetadata, generateViewport } from '../../milpac-file'

/**
 * `/milpacs/<name>/kits/<id>` — one specific kit, so a link to it survives being
 * pasted into Discord. An id that does not resolve falls back to the member's
 * default rather than 404ing; `pickLoadoutId` owns that rule.
 */
export default async function Page({ params }: { params: Promise<{ username: string; kit: string }> }) {
    const { username, kit } = await params
    return <MilpacFile segment={username} tab='kits' kitSegment={kit} />
}
