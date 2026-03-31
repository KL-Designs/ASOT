import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import AdminTiles from './AdminTiles'



export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) redirect('/me')

    return (
        <AdminTiles
            canManageMembers={client.hasRoles(me, PERMISSIONS.admin.manageMembers)}
            canManageGallery={client.hasRoles(me, PERMISSIONS.gallery.manage)}
            canManageOrbat={client.hasRoles(me, PERMISSIONS.admin.manageOrbat)}
            canMassImport={client.hasRoles(me, PERMISSIONS.admin.massImport)}
            displayName={me.guild?.nickname || me.globalName || me.username}
        />
    )
}
