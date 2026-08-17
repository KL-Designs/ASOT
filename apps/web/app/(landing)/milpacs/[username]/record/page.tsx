import { MilpacFile } from '../milpac-file'

export { generateMetadata, generateViewport } from '../milpac-file'

/** `/milpacs/<name>/record` — what the member has earned. */
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params
    return <MilpacFile segment={username} tab='record' />
}
