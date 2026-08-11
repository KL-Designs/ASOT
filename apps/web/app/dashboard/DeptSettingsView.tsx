'use client'

import DeptMembersTab from '@/app/dashboard/DeptMembersTab'

export default function DeptSettingsView({
    department, displayName, userId, canManage, isJ4 = false,
}: {
    department: string
    displayName: string
    userId: string
    canManage: boolean
    isJ4?: boolean
}) {
    return (
        <div className='flex flex-col'>
            <DeptMembersTab department={department} displayName={displayName} userId={userId} canManage={canManage} isJ4={isJ4} />
        </div>
    )
}
