import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getAvailableWorlds } from '@/lib/maps'
import MapSection from '@/components/operations/map/MapSection'
import FullscreenPage from '@/components/FullscreenPage'
import Link from 'next/link'
import EditorPage from '../edit/EditorPage'

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    await connection()

    const [operation, me] = await Promise.all([
        Db.operations.findOne({ _id: new ObjectId(id) }, { projection: { title: 1, themeColor: 1, mapWorld: 1 } }),
        client.fetchMe().catch(() => null),
    ])

    const availableWorlds = getAvailableWorlds()
    const world = availableWorlds.find(w => w.name === (operation?.mapWorld ?? '')) ?? null
    const isHQ = me ? client.hasRoles(me, PERMISSIONS.pages.operationsEdit) : false

    // One URL for "the map of this operation", serving whichever version the
    // viewer is entitled to: the editor's Map tab for anyone who can edit, the
    // read-only fullscreen viewer below for everyone else. Splitting it into two
    // paths would mean the link people paste to each other only works for half
    // of them.
    if (isHQ) return <EditorPage />
    const themeColor = operation?.themeColor || '#db001d'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0d' }}>
            <FullscreenPage />
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                background: 'rgba(10,10,10,0.95)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                flexShrink: 0,
                zIndex: 10,
            }}>
                <Link
                    href={`/operations/${id}`}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'rgba(255,255,255,0.45)',
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Back
                </Link>
                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: themeColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.03em' }}>
                        {operation?.title ?? 'Operation Map'}
                    </span>
                </div>
            </div>

            {/* Map */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                <MapSection
                    operationId={id}
                    canEdit={isHQ}
                    world={world}
                />
            </div>
        </div>
    )
}
