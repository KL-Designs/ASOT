'use client'

import DeptMembersTab from '@/app/dashboard/DeptMembersTab'
import DeptLinksManagerCard from '@/app/dashboard/_components/dept-links/DeptLinksManagerCard'

export default function DeptSettingsView({
    department, displayName, userId, canManage, canManageLinks, isJ4 = false,
}: {
    department: string
    displayName: string
    userId: string
    canManage: boolean
    canManageLinks: boolean
    isJ4?: boolean
}) {
    return (
        <div className='flex flex-col'>
            <DeptLinksManagerCard department={department} canManage={canManageLinks} />
            <DeptMembersTab department={department} displayName={displayName} userId={userId} canManage={canManage} isJ4={isJ4} />
        </div>
    )
}
