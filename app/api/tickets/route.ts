import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logAction'
import { notifyTicketDeptLeads } from '@/lib/notifications/ticket'

const PRIVATE_CATEGORIES: CommunityTicketCategory[] = ['unit-feedback', 'complaint', 'award']

type User = Awaited<ReturnType<typeof client.fetchMe>>

function getLeadDepts(me: User): string[] {
    return Object.entries(PERMISSIONS.departmentLeads)
        .filter(([, roles]) => client.hasRoles(me, roles))
        .map(([dept]) => dept)
}

function routeTicket(subtype: string, responsibleDept?: string): { department: string; departments: string[] } {
    switch (subtype) {
        case 'mod-request':
            return { department: 'j4', departments: ['j4', 'j7'] }
        case 'feature-request': {
            if (responsibleDept) {
                const depts = responsibleDept === 'j4' ? ['j4'] : [responsibleDept, 'j4']
                return { department: responsibleDept, departments: depts }
            }
            return { department: 'j4', departments: ['j4'] }
        }
        case 'bug-website':
        case 'bug-milpac':
        case 'bug-milpack':
        case 'bug-teamspeak':
            return { department: 'j7', departments: ['j7'] }
        case 'bug-arma':
        case 'bug-discord':
        case 'bug-other-game':
        case 'bug-other':
            return { department: 'j4', departments: ['j4'] }
        case 'mission':
        case 'campaign':
            return { department: 'j2', departments: ['j2'] }
        default:
            return { department: 'j4', departments: ['j4'] }
    }
}


export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const leadDepts = getLeadDepts(me)
    const { searchParams } = new URL(request.url)

    const category = searchParams.get('category')
    const statuses = searchParams.getAll('status')
    const status = searchParams.get('status')
    const sort = searchParams.get('sort') ?? 'votes'
    const requestedDept = searchParams.get('department')
    const tag = searchParams.get('tag')
    const showDeleted = searchParams.get('deleted') === '1' && isJ4

    const isDeptLead = leadDepts.length > 0
    const isLeadForRequestedDept = requestedDept && requestedDept !== 'all' && leadDepts.includes(requestedDept)

    const filter: Record<string, unknown> = {}

    if (isJ4) {
        if (!showDeleted) filter.isDeleted = { $ne: true }
    } else if (isDeptLead && isLeadForRequestedDept) {
        filter.isDeleted = { $ne: true }
    } else {
        filter.visibility = 'public'
        filter.isDeleted = { $ne: true }
    }

    if (category && category !== 'all') filter.category = category

    const allStatuses = statuses.length > 1 ? statuses : status && status !== 'all' ? [status] : []
    if (allStatuses.length === 1) filter.status = allStatuses[0]
    else if (allStatuses.length > 1) filter.status = { $in: allStatuses }

    if (requestedDept && requestedDept !== 'all') {
        if (isJ4) {
            filter.department = requestedDept
        } else if (isLeadForRequestedDept) {
            filter.$or = [{ department: requestedDept }, { departments: requestedDept }]
        }
    }

    if (tag) filter.tags = tag

    const sortOrder: Record<string, 1 | -1> = sort === 'votes'
        ? { voteScore: -1, createdAt: -1 }
        : sort === 'newest'
            ? { createdAt: -1 }
            : { createdAt: 1 }

    const items = await Db.communityTickets
        .find(filter)
        .sort(sortOrder)
        .project({
            activityLog: 0,
            stepsToReproduce: 0, expectedResult: 0, actualResult: 0,
            missionEnemyForces: 0, missionFriendlyForces: 0, missionIndependentForces: 0,
            missionCivilianPopulace: 0, missionObjectives: 0, missionStory: 0,
            missionPlayerExperience: 0, missionMechanics: 0, missionAdditionalNotes: 0,
            campaignPhases: 0,
        })
        .toArray()

    return NextResponse.json(items)
}


export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { category, subtype, title, description, isAnonymous, ...rest } = body

    if (!category || !subtype || !title?.trim() || !description?.trim()) {
        return NextResponse.json({ error: 'category, subtype, title, and description are required' }, { status: 400 })
    }

    const isPrivate = PRIVATE_CATEGORIES.includes(category as CommunityTicketCategory)
    const visibility: CommunityTicketVisibility = isPrivate ? 'private' : 'public'
    const { department, departments } = routeTicket(subtype, rest.responsibleDept)

    if (subtype === 'mod-request' && rest.modLink) {
        const normalised = rest.modLink.trim().toLowerCase().replace(/\/+$/, '')
        const existing = await Db.communityTickets.findOne({
            subtype: 'mod-request',
            isDeleted: { $ne: true },
            modLink: { $regex: new RegExp(normalised.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        })
        if (existing) {
            return NextResponse.json({ error: 'DUPLICATE_MOD', existingId: existing._id.toString() }, { status: 409 })
        }
    }

    const now = new Date()
    const authorName = isAnonymous ? 'Anonymous' : (me.guild.displayName ?? me.username)

    const doc: CommunityTicket = {
        _id: new ObjectId(),
        category: category as CommunityTicketCategory,
        subtype: subtype as CommunityTicketSubtype,
        visibility,
        status: 'open',
        title: title.trim(),
        description: description.trim(),
        authorId: me.id,
        authorName,
        authorAvatarId: isAnonymous ? undefined : (me.guild?.avatar ?? me.avatar ?? undefined),
        isAnonymous: !!isAnonymous,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        upvotes: [],
        downvotes: [],
        voteScore: 0,
        commentCount: 0,
        department,
        departments,
        tags: rest.tags ?? [],
        attachments: [],
        mediaLinks: rest.mediaLinks ?? [],
        activityLog: [{
            action: 'created',
            actorId: me.id,
            actorName: me.guild.displayName ?? me.username,
            timestamp: now,
        }],
        ...(rest.modLink        && { modLink: rest.modLink.trim() }),
        ...(rest.game           && { game: rest.game }),
        ...(rest.gameOther      && { gameOther: rest.gameOther }),
        ...(rest.featureCategory && { featureCategory: rest.featureCategory }),
        ...(rest.featureCategoryOther && { featureCategoryOther: rest.featureCategoryOther }),
        ...(rest.responsibleDept && { responsibleDept: rest.responsibleDept }),
        ...(rest.weblink        && { weblink: rest.weblink.trim() }),
        ...(rest.justification  && { justification: rest.justification.trim() }),
        ...(rest.stepsToReproduce && { stepsToReproduce: rest.stepsToReproduce.trim() }),
        ...(rest.expectedResult && { expectedResult: rest.expectedResult.trim() }),
        ...(rest.actualResult   && { actualResult: rest.actualResult.trim() }),
        ...(rest.severity       && { severity: rest.severity }),
        ...(rest.discordIssueTypes && { discordIssueTypes: rest.discordIssueTypes }),
        ...(rest.discordIssueDetail && { discordIssueDetail: rest.discordIssueDetail }),
        ...(rest.bugUrl         && { bugUrl: rest.bugUrl.trim() }),
        ...(rest.tsBugType      && { tsBugType: rest.tsBugType }),
        ...(rest.bugPlatformDetail && { bugPlatformDetail: rest.bugPlatformDetail.trim() }),
        ...(rest.missionType    && { missionType: rest.missionType }),
        ...(rest.missionEnemyForces && { missionEnemyForces: rest.missionEnemyForces.trim() }),
        ...(rest.missionFriendlyForces && { missionFriendlyForces: rest.missionFriendlyForces.trim() }),
        ...(rest.missionIndependentForces && { missionIndependentForces: rest.missionIndependentForces.trim() }),
        ...(rest.missionCivilianPopulace && { missionCivilianPopulace: rest.missionCivilianPopulace.trim() }),
        ...(rest.missionObjectives && { missionObjectives: rest.missionObjectives.trim() }),
        ...(rest.missionStory   && { missionStory: rest.missionStory.trim() }),
        ...(rest.missionPlayerExperience && { missionPlayerExperience: rest.missionPlayerExperience.trim() }),
        ...(rest.missionMechanics && { missionMechanics: rest.missionMechanics.trim() }),
        ...(rest.missionAdditionalNotes && { missionAdditionalNotes: rest.missionAdditionalNotes.trim() }),
        ...(rest.campaignPhases && { campaignPhases: rest.campaignPhases }),
        ...(rest.feedbackCategories && { feedbackCategories: rest.feedbackCategories }),
        ...(rest.feedbackCategoryOther && { feedbackCategoryOther: rest.feedbackCategoryOther }),
        ...(rest.feedbackType   && { feedbackType: rest.feedbackType }),
        ...(rest.complainantName && { complainantName: rest.complainantName.trim() }),
        ...(rest.complainantAnonymous !== undefined && { complainantAnonymous: rest.complainantAnonymous }),
        ...(rest.membersInvolved && { membersInvolved: rest.membersInvolved }),
        ...(rest.membersInvolvedNotListed && { membersInvolvedNotListed: rest.membersInvolvedNotListed }),
        ...(rest.isStaffComplaint !== undefined && { isStaffComplaint: rest.isStaffComplaint }),
        ...(rest.desiredOutcome && { desiredOutcome: rest.desiredOutcome.trim() }),
        ...(rest.evidenceAcknowledged !== undefined && { evidenceAcknowledged: rest.evidenceAcknowledged }),
        ...(rest.nomineeName    && { nomineeName: rest.nomineeName.trim() }),
        ...(rest.nomineeRank    && { nomineeRank: rest.nomineeRank.trim() }),
        ...(rest.nominatorName  && { nominatorName: rest.nominatorName.trim() }),
        ...(rest.supportingMembers && { supportingMembers: rest.supportingMembers }),
        ...(rest.awardType      && { awardType: rest.awardType }),
        ...(rest.awardCategory  && { awardCategory: rest.awardCategory }),
        ...(rest.awardCategoryOther && { awardCategoryOther: rest.awardCategoryOther }),
        ...(rest.awardRequirements && { awardRequirements: rest.awardRequirements.trim() }),
        ...(rest.awardDesignRef && { awardDesignRef: rest.awardDesignRef.trim() }),
        ...(rest.awardDesignNotes && { awardDesignNotes: rest.awardDesignNotes.trim() }),
        ...(rest.otherComments  && { otherComments: rest.otherComments.trim() }),
    }

    await Db.communityTickets.insertOne(doc)

    const ticketId = doc._id.toString()
    const actionUrl = `/tickets/${ticketId}`
    const displayName = isAnonymous ? 'Anonymous' : (me.guild.displayName ?? me.username)

    // Log creation
    await logAction({
        action: 'ticket.create',
        category: 'ticket',
        performedBy: me.id,
        performedByName: displayName,
        entityType: 'ticket',
        entityId: ticketId,
        actionUrl,
        target: `"${title.trim()}" (${subtype.replace(/-/g, ' ')})`,
        details: { department, departments, visibility, subtype },
    })

    // Notify dept leads for all routed departments
    const subtypeLabel = subtype.replace(/-/g, ' ')
    const deptLabels = [...new Set(departments)].map(d => d.toUpperCase()).join(' + ')
    const notifTitle = `New ${subtypeLabel}: "${title.trim()}"`
    const notifBody = `${displayName} submitted a ${subtypeLabel} ticket.\nDepartment(s): ${deptLabels}\nSubtype: ${subtypeLabel}${visibility === 'private' ? '\n[Private]' : ''}`
    const uniqueDepts = [...new Set(departments)]
    await Promise.all(uniqueDepts.map(dept =>
        notifyTicketDeptLeads(dept, { type: 'ticket_assigned', title: notifTitle, body: notifBody, actionUrl, ticketId })
            .catch(err => console.error(`[tickets] notify dept ${dept} failed:`, err))
    ))

    return NextResponse.json(doc, { status: 201 })
}
