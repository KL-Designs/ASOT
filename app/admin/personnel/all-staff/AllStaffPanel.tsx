'use client'

import { Typography } from '@mui/material'
import MoveRequestsTab from './tabs/MoveRequestsTab'

export default function AllStaffPanel({ userId, displayName }: { userId: string; displayName: string }) {
    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>
            {/* Header */}
            <div
                className='flex flex-col px-5 py-4 mx-6 mt-6'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Personnel
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    All Staff
                </Typography>
                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                    Move Requests
                </Typography>
            </div>

            <div className='flex-1 min-h-0'>
                <MoveRequestsTab userId={userId} displayName={displayName} />
            </div>
        </div>
    )
}
