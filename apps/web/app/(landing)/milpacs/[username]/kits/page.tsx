import { MilpacFile } from '../milpac-file'

export { generateMetadata, generateViewport } from '../milpac-file'

/** `/milpacs/<name>/kits` — their default kit. */
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params
    return <MilpacFile segment={username} tab='kits' />
}
