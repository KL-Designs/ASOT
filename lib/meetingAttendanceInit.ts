/**
 * lib/meetingAttendanceInit.ts
 *
 * Shared function that builds and inserts the attendance list for a meeting.
 * Called both on meeting creation (auto-init) and from the attendance POST
 * endpoint when a lead manually syncs.
 */

import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'

const GROUP_ORDER: MeetingAttendee['group'][] = ['j4', 'dept_lead', 'dept_member', 'invited']

function buildDisplayName(u: Record<string, unknown>): string {
    const nick = ((u.guild as { nickname?: string })?.nickname ?? '').replace(/\s*\[[^\]]*\]/g, '').trim()
    const nickParts = nick.split(' ')
    return (
        (u.name as string) ||
        (nickParts.length > 1 ? nickParts.slice(1).join(' ') : nick) ||
        (u.globalName as string) ||
        (u.username as string) ||
        'Unknown'
    )
}

export async function initMeetingAttendance(
    meetingId: string,
    department: string,
    invitedUserIds: string[] = [],
): Promise<number> {
    const leadRoleNames: string[] =
        PERMISSIONS.departmentLeads[department as keyof typeof PERMISSIONS.departmentLeads] ?? []

    // Fetch department members
    const deptUsers = await Db.users
        .find(
            { departments: department, isSkeletonAccount: { $ne: true }, discharged: { $exists: false } },
            { projection: { id: 1, name: 1, globalName: 1, username: 1, 'guild.nickname': 1, 'guild.roles': 1, departments: 1 } }
        )
        .toArray()

    // Fetch J4 members (skip if the meeting itself is a J4 meeting)
    const j4Users = department !== 'j4'
        ? await Db.users
            .find(
                { departments: 'j4', isSkeletonAccount: { $ne: true }, discharged: { $exists: false } },
                { projection: { id: 1, name: 1, globalName: 1, username: 1, 'guild.nickname': 1, 'guild.roles': 1, departments: 1 } }
            )
            .toArray()
        : []

    const deptUserIds = new Set(deptUsers.map((u: { id: string }) => u.id))
    const j4UserIds   = new Set(j4Users.map((u: { id: string }) => u.id))

    // Fetch invited non-dept, non-J4 members
    const outsideInvitedIds = invitedUserIds.filter(uid => !deptUserIds.has(uid) && !j4UserIds.has(uid))
    const invitedUsers = outsideInvitedIds.length > 0
        ? await Db.users
            .find(
                { id: { $in: outsideInvitedIds }, isSkeletonAccount: { $ne: true }, discharged: { $exists: false } },
                { projection: { id: 1, name: 1, globalName: 1, username: 1, 'guild.nickname': 1, 'guild.roles': 1 } }
            )
            .toArray()
        : []

    // Load existing attendees so we don't add duplicates
    const meeting = await Db.meetings.findOne(
        { _id: new ObjectId(meetingId) },
        { projection: { attendees: 1 } }
    )
    const existingIds = new Set((meeting?.attendees ?? []).map((a: MeetingAttendee) => a.userId))

    function getUserGroup(u: Record<string, unknown>): MeetingAttendee['group'] {
        const userDepts = (u.departments as string[] | undefined) ?? []
        if (userDepts.includes('j4') && !userDepts.includes(department)) return 'j4'
        const guildRoles = (u.guild as { roles?: string[] } | undefined)?.roles ?? []
        if (leadRoleNames.some(r => guildRoles.includes(r))) return 'dept_lead'
        return 'dept_member'
    }

    function toAttendee(u: Record<string, unknown>, group: MeetingAttendee['group']): MeetingAttendee | null {
        const uid = u.id as string
        if (existingIds.has(uid)) return null
        return { userId: uid, displayName: buildDisplayName(u).trim(), group, status: 'pending' }
    }

    const newAttendees: MeetingAttendee[] = []

    for (const u of deptUsers) {
        const a = toAttendee(u as Record<string, unknown>, getUserGroup(u as Record<string, unknown>))
        if (a) newAttendees.push(a)
    }
    for (const u of j4Users) {
        if (deptUserIds.has((u as { id: string }).id)) continue
        const a = toAttendee(u as Record<string, unknown>, 'j4')
        if (a) newAttendees.push(a)
    }
    for (const u of invitedUsers) {
        const a = toAttendee(u as Record<string, unknown>, 'invited')
        if (a) newAttendees.push(a)
    }

    newAttendees.sort((a, b) => {
        const gi = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
        return gi !== 0 ? gi : a.displayName.localeCompare(b.displayName)
    })

    if (newAttendees.length > 0) {
        await Db.meetings.updateOne(
            { _id: new ObjectId(meetingId) },
            {
                $push: { attendees: { $each: newAttendees } } as Record<string, unknown>,
                $set: { updatedAt: new Date() },
            }
        )
    }

    return newAttendees.length
}
