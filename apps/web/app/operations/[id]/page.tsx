import Db from '@/lib/mongo'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import ClassicPage from './themes/ClassicPage'
import ModernPage from './themes/ModernPage'
import type { OrdersAttendance, ThemePageProps } from './themes/theme-props'

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
    const isHQ = me ? client.hasRoles(me, PERMISSIONS.pages.operationsEdit) : false
    const isAllStaff = me ? await hasPermission(me, 'attendance.confirm') : false
    // See PERMISSIONS.attendance.manage -- three-armed for the same reason the
    // write route is: `hasPermission` has no Discord-role fallback and does not
    // honour the J4 bypass, and the legacy ORBAT key must keep working.
    const canManageAttendance = me
        ? (await hasPermission(me, 'attendance.manage'))
            || client.hasRoles(me, PERMISSIONS.attendance.manage)
            || client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
        : false
    const isJ6 = me ? client.hasRoles(me, PERMISSIONS.departments.j6) : false

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
        isJ6, isSectionLeader, showAcknowledgeCard, activePageParam, fromJ2,
    }

    const pageTheme = operation.pageTheme || 'modern'
    if (pageTheme !== 'modern') return <ClassicPage {...shared} />

    return <ModernPage {...shared} attendance={await readAttendance(id, me?.id ?? null)} />
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
