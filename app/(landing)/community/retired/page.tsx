import WipPage from '@/components/wip-page'
import RetiredWall from './RetiredWall'

export default function Page() {
    if (process.env.WIP_PAGES === 'true') return <WipPage />
    return <RetiredWall />
}
