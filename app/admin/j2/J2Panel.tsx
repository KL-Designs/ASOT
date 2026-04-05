'use client'

import { Typography } from '@mui/material'
import DeptMembersTab from '@/app/admin/DeptMembersTab'

export default function J2Panel({
    displayName,
    userId,
    canManageMembers,
}: {
    displayName: string
    userId: string
    canManageMembers: boolean
}) {
    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>
            <div
                className='flex flex-col px-5 py-4 mx-6 mt-6'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Departments
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    J2 — Mission Making
                </Typography>
            </div>
            <div className='flex-1 min-h-0 overflow-y-auto'>
                <DeptMembersTab department='j2' displayName={displayName} userId={userId} canManage={canManageMembers} />
            </div>
        </div>
    )
}
