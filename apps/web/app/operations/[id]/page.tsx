import Db from '@/lib/mongo'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import { canEach } from '@/lib/operations/permissions'
import ClassicPage from './themes/ClassicPage'
import ModernPage from './themes/ModernPage'
import ColdWarPage from './themes/ColdWarPage'
import SciFiPage from './themes/SciFiPage'
import type { OrdersAttendance, OrdersLineage, ThemePageProps } from './themes/theme-props'

/**
 * `/operations/{id}` -- the Orders view, the page anybody can read.
 *
 * This file fetches and gates; it renders almost nothing. Each page theme is
 * its own component under `themes/`, because Modern was rebuilt and the other
 * two were not -- and one component full of three-way ternaries meant every
 * change to one theme risked the two nobody had asked to touch. Adding a theme
 * is a new file and a line in the dispatch below.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
    const { id } = await params
    const sp = searchParams ? await searchParams : {}
    const activePageParam = typeof sp?.page === 'string' ? sp.page : undefined
    const fromJ2 = sp?.from === 'j2'
    await connection()

    const [operation, me] = await Promise.all([
        Db.operations.findOne({ _id: new ObjectId(id) }),
        client.fetchMe().catch(() => null),
    ])
    const isLoggedIn = !!me

    /*
     * Every question this page asks about the viewer, answered once and in
     * parallel.
     *
     * Each of these used to be spelled out here as its own two- or three-armed
     * check, and each restated the legacy fallbacks that `hasPermission`'s lack
     * of a Discord-role arm forces. That is now the business of
     * `lib/operations/permissions.ts`, where the fallbacks are written down per
     * capability instead of per call site — which is what let five different
     * powers hide behind one `pages.operationsEdit` check for as long as they did.
     */
    const caps = await canEach(me, [
        'orders.view', 'schedule.view', 'attendance.view',
        'attendance.manage', 'attendance.confirm', 'zeus', 'ocap.manage',
    ] as const)

    const isHQ = caps['orders.view']
    const isAllStaff = caps['attendance.confirm']
    const canManageAttendance = caps['attendance.manage']
    const canZeus = caps['zeus']
    const access = { schedule: caps['schedule.view'], attendance: caps['attendance.view'] }

    // Check if the logged-in user is a section leader (isSenior on their ORBAT position)
    const isSectionLeader = me
        ? !!(await Db.orbatPositions.findOne({ userId: me.id, isSenior: true }))
        : false

    const showAcknowledgeCard = isAllStaff && operation?.status === 'Upcoming'

    if (!operation) return (
        <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Operation not found
        </div>
    )

    const shared: ThemePageProps = {
        id, operation, me, isLoggedIn, isHQ, isAllStaff, canManageAttendance,
        canZeus, canOcapManage: caps['ocap.manage'], access,
        isSectionLeader, showAcknowledgeCard, activePageParam, fromJ2,
    }

    /*
     * Themes that have their own page get one; everything else falls back to
     * the page as it always looked. `coldwar` was already a selectable era with
     * no rendering of its own, which is why choosing it used to give you Modern.
     *
     * `scifi` is the other direction: it *did* render, as ClassicPage's `isSF`
     * variant, and now has a page of its own instead. ClassicPage keeps that
     * branch — it is the fallback for anything unrecognised, and deleting a
     * working code path to tidy up is how a fallback stops being one — but
     * nothing routes to it any more.
     */
    const pageTheme = operation.pageTheme || 'modern'
    const OWN_PAGE = { modern: ModernPage, coldwar: ColdWarPage, scifi: SciFiPage } as const
    const Themed = OWN_PAGE[pageTheme as keyof typeof OWN_PAGE]
    if (!Themed) return <ClassicPage {...shared} />

    const [attendance, lineage] = await Promise.all([
        readAttendance(id, me?.id ?? null),
        readLineage(operation),
    ])

    return <Themed {...shared} attendance={attendance} lineage={lineage} />
}

/**
 * Which campaign this operation belongs to, and which mission of it.
 *
 * The operation has carried `campaignId`/`campaignMissionId` since campaigns
 * existed, and no public page has ever shown either — so "Saturday serial" in
 * the hero named a night without saying a night *of* what.
 *
 * Null unless the campaign itself resolves: a mission number with no campaign
 * to number it against says less than nothing.
 */
async function readLineage(operation: Operation): Promise<OrdersLineage | null> {
    if (!operation.campaignId) return null

    const campaign = await Db.operationCampaigns
        .findOne({ _id: operation.campaignId, isDeleted: { $ne: true } }, { projection: { name: 1 } })
        .catch(() => null)
    if (!campaign?.name) return null

    // The link is stored as a plain string, so it can be anything.
    let missionId: ObjectId | null = null
    try {
        if (operation.campaignMissionId) missionId = new ObjectId(operation.campaignMissionId)
    } catch { /* not an id — the campaign name alone is still worth showing */ }

    const mission = missionId
        ? await Db.campaignMissions
            .findOne({ _id: missionId, isDeleted: { $ne: true } }, { projection: { sequence: 1 } })
            .catch(() => null)
        : null

    return { campaign: campaign.name, sequence: mission?.sequence ?? null }
}

/**
 * Enough attendance to fill the Modern header, and no more.
 *
 * Projected rather than fetched whole: the board's own payload carries every
 * record, every section's roles and a user lookup for each, which is a lot of
 * work to answer "are you coming, and do you have a position yet".
 *
 * Reading it here rather than in a client component is the point -- the header
 * states what the member owes, and a header that fills in a second after the
 * page paints is worse than one that never moved.
 */
async function readAttendance(id: string, myUserId: string | null): Promise<OrdersAttendance> {
    const att = await Db.operationAttendance.findOne(
        { operationId: new ObjectId(id) },
        { projection: { records: 1, roster: 1, rsvpOpen: 1 } },
    ).catch(() => null)

    const roster = att?.roster ?? []
    const mine = myUserId ? att?.records?.find(rec => rec.userId === myUserId) : undefined
    const mySlot = myUserId ? roster.find(slot => slot.occupantUserId === myUserId) : undefined

    return {
        rsvpOpen: att?.rsvpOpen ?? false,
        attending: att?.records?.filter(rec => rec.rsvp === 'attending').length ?? 0,
        seats: roster.length,
        filled: roster.filter(slot => slot.occupantUserId).length,
        myRsvp: mine?.rsvp ?? null,
        myPosition: mySlot?.role ?? null,
    }
}
