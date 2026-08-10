import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import StaffDashboardShell from './StaffDashboardShell'
import { hasPermission } from '@/lib/orbat/hasPermission'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/me')

    const isStaff = client.hasRoles(me, PERMISSIONS.pages.admin)

    const permissions = {
        displayName:     me.guild?.nickname || me.globalName || me.username || '',
        isStaff,
        canSeeJ1:        client.hasRoles(me, PERMISSIONS.departments.j1),
        canManageJ1:     client.hasRoles(me, PERMISSIONS.departmentLeads.j1) || client.hasRoles(me, PERMISSIONS.pages.admin),
        canSeeJ2:        client.hasRoles(me, PERMISSIONS.departments.j2),
        canSeeJ3:        client.hasRoles(me, PERMISSIONS.departments.j3),
        canSeeJ4:        client.hasRoles(me, PERMISSIONS.departments.j4),
        canSeeJ5:        client.hasRoles(me, PERMISSIONS.departments.j5),
        canSeeJ6:        client.hasRoles(me, PERMISSIONS.departments.j6),
        canSeeJ7:        client.hasRoles(me, PERMISSIONS.departments.j7),
        canSeeOrbat:     client.hasRoles(me, PERMISSIONS.admin.manageOrbat),
        canSeePersonnel: client.hasRoles(me, PERMISSIONS.pages.members),
    }

    return (
        <StaffDashboardShell permissions={permissions}>
            {children}
        </StaffDashboardShell>
    )
}
