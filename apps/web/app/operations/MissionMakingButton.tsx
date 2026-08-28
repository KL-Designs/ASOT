import Link from 'next/link'
import { Dashboard } from '@mui/icons-material'

/**
 * The staff route into mission making. A link and nothing else — it is rendered
 * only for viewers with `pages.operationsEdit`, and it is the reason the board
 * itself no longer needs Edit buttons on every row.
 */
export default function MissionMakingButton() {
    return (
        <Link href='/dashboard/j2?tab=0' style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                    background: 'rgba(100,150,237,0.07)', border: '1px solid rgba(100,150,237,0.3)',
                    color: 'rgba(100,150,237,0.75)', fontSize: '0.7rem', fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
                }}
            >
                <Dashboard style={{ fontSize: 15 }} />Mission Making
            </div>
        </Link>
    )
}
