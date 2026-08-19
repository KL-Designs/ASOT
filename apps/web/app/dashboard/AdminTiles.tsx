'use client'

import { useState } from 'react'
import { ManageAccounts, PhotoLibrary, AccountTree, CloudUpload } from '@mui/icons-material'
import { PageHead, SectionLabel, ToolCard, ToolGrid } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'
import ImportPanel from './ImportPanel'

interface Props {
    canManageMembers: boolean
    canManageGallery: boolean
    canManageOrbat:   boolean
    canMassImport:    boolean
    displayName:      string
}

/**
 * The admin landing tiles.
 *
 * Four identical red-outlined squares, each carrying a two-line shout in caps
 * and nothing that said what the screen behind it does. They are tool cards
 * now: a name in sentence case, a line describing the destination, and the mass
 * import — the only one here that writes to many records at once — marked as
 * the one to be careful with.
 */
export default function AdminTiles({ canManageMembers, canManageGallery, canManageOrbat, canMassImport, displayName }: Props) {
    const [importOpen, setImportOpen] = useState(false)

    return (
        <div className={`${s.dash} h-full w-full p-6 md:p-10 flex flex-col gap-6 overflow-y-auto`}>

            <PageHead
                kicker={<>ASOT // Administration</>}
                title='Admin panel'
                right={<span className={s.hint}>Signed in as {displayName}</span>}
            />

            <div className='flex flex-col gap-4'>
                <SectionLabel>Management</SectionLabel>
                <ToolGrid>
                    {canManageMembers && (
                        <ToolCard
                            href='/members'
                            icon={<ManageAccounts sx={{ fontSize: 20 }} />}
                            title='User management'
                            description='Search the roster, open a milpac, edit a member record.'
                        />
                    )}
                    {canManageGallery && (
                        <ToolCard
                            href='/dashboard/gallery'
                            icon={<PhotoLibrary sx={{ fontSize: 20 }} />}
                            title='Gallery management'
                            description='Upload, sort and retire operation photography.'
                        />
                    )}
                    {canManageOrbat && (
                        <ToolCard
                            href='/dashboard/orbat'
                            icon={<AccountTree sx={{ fontSize: 20 }} />}
                            title='ORBAT management'
                            description='Structure, positions and who fills them.'
                        />
                    )}
                    {canMassImport && (
                        <ToolCard
                            tier='caution'
                            onClick={() => setImportOpen(true)}
                            icon={<CloudUpload sx={{ fontSize: 20 }} />}
                            title='Import panel'
                            description='Bulk-load records from a sheet.'
                            footer='Writes to many records at once'
                        />
                    )}
                </ToolGrid>
            </div>

            <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} />
        </div>
    )
}
