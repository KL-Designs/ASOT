import { Construction } from '@mui/icons-material'
import { EmptyState, PageHead } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

/**
 * The screen a dashboard route shows before it is built.
 *
 * It used to be a full-width red-outlined box whose only content was the news
 * that there was nothing here — the same weight the working screens carry. An
 * empty state is the size of its content.
 */
export default function PlaceholderPanel({
    title,
    description,
}: {
    title: string
    description?: string
}) {
    return (
        <div className={`${s.dash} h-full w-full p-6 md:p-10 flex flex-col gap-6`}>
            <PageHead kicker={<>ASOT // Dashboard</>} title={title} />

            <EmptyState
                icon={<Construction sx={{ fontSize: 28 }} />}
                title='Under construction'
            >
                {description ?? 'This screen is planned but not built yet.'}
            </EmptyState>
        </div>
    )
}
