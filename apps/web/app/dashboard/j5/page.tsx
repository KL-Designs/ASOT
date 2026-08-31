import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { hasDepartmentPermission } from '@/lib/orbat/hasDepartmentPermission'
import { DEPT_LINKS_MANAGE_KEY } from '@/lib/dept-links/keys'
import J5Panel from './J5Panel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.departments.j5)) redirect('/dashboard')

    const displayName = me.guild?.nickname || me.globalName || me.username || ''
    const canManageMembers = await hasPermission(me, 'departmentLeads.j5')
    const canManageLinks = canManageMembers || await hasDepartmentPermission(me, 'j5', DEPT_LINKS_MANAGE_KEY)
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    const canReviewGallery = await hasPermission(me, 'gallery.review')
    const canManageGalleryTags = await hasPermission(me, 'gallery.tags')
    const canManageGallery = await hasPermission(me, 'gallery.manage')

    return (
        <J5Panel
            displayName={displayName}
            userId={me.id}
            canManageMembers={canManageMembers}
            canManageLinks={canManageLinks}
            isJ4={isJ4}
            canReviewGallery={canReviewGallery}
            canManageGalleryTags={canManageGalleryTags}
            canManageGallery={canManageGallery}
        />
    )
}
