import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import TasksPage from './TasksPage'

// Map of department keys → Discord role names that belong to each dept
const DEPT_ROLE_MAP: Record<string, string[]> = {
    j1: ['J1-Staff', 'J1-Recruiting'],
    j2: ['J2-Mission Making', 'J2-Team Lead'],
    j3: ['J3-Training', 'J3-Team Lead'],
    j4: ['J4-Administration'],
    j5: ['J5-Media'],
    j6: ['J6-Game Master', 'J6-Department Lead'],
    j7: ['J7 Community Development', 'J7 Staff'],
}

// All roles that can be assigned tasks, in display order
const ALL_ASSIGNABLE_ROLES = [
    'J1-Staff', 'J1-Recruiting',
    'J2-Team Lead', 'J2-Mission Making',
    'J3-Team Lead', 'J3-Training',
    'J4-Administration',
    'J5-Media',
    'J6-Department Lead', 'J6-Game Master',
    'J7 Staff', 'J7 Community Development',
    'HQ Staff', 'All Staff',
    'ASOT Member',
]

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) redirect('/me')

    const isElevated = client.hasRoles(me, PERMISSIONS.departments.j4)

    // Resolve role names the user currently holds
    const myRoleNames = client.roles
        .filter(r => (me.guild?.roles ?? []).includes(r.id))
        .map(r => r.name)

    const isAllBatStaff = myRoleNames.some(r => ['HQ Staff', 'All Staff'].includes(r))

    // Which departments does this user belong to?
    const userDepts = Object.entries(DEPT_ROLE_MAP)
        .filter(([, roles]) => myRoleNames.some(r => roles.includes(r)))
        .map(([dept]) => dept)

    // Compute which roles this user is allowed to assign tasks to
    let availableRoles: string[]
    if (isElevated || isAllBatStaff) {
        availableRoles = ALL_ASSIGNABLE_ROLES
    } else {
        // Department staff can only assign to roles within their departments
        const deptRoles = userDepts.flatMap(d => DEPT_ROLE_MAP[d] ?? [])
        availableRoles = Array.from(new Set(deptRoles))
    }

    return (
        <TasksPage
            userId={me.id}
            displayName={me.guild?.displayName || me.guild?.nickname || me.globalName || me.username || me.id}
            isElevated={isElevated}
            isAllBatStaff={isAllBatStaff}
            userDepts={userDepts}
            availableRoles={availableRoles}
        />
    )
}
