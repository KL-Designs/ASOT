import { MilpacFile } from './milpac-file'

export { generateMetadata, generateViewport } from './milpac-file'

/**
 * The default section, on the bare `/milpacs/<name>` URL.
 *
 * Each section is its own route rather than a `?tab=` value on one — see the
 * comment on `MilpacFile` for why. These four files are deliberately thin: all
 * the work is in the one component they share.
 */
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params
    return <MilpacFile segment={username} tab='overview' />
}
