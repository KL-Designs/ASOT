import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

const PRIVATE_CATEGORIES: CommunityTicketCategory[] = ['unit-feedback', 'complaint', 'award']
const DEFAULT_DEPT: Record<CommunityTicketCategory, string> = {
    'request': 'j4',
    'bug': 'j4',
    'mission': 'j2',
    'campaign': 'j2',
    'unit-feedback': 'j4',
    'complaint': 'j4',
    'award': 'j4',
}


export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const { searchParams } = new URL(request.url)

    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const sort = searchParams.get('sort') ?? 'votes'
    const department = searchParams.get('department')
    const showDeleted = searchParams.get('deleted') === '1' && isJ4

    const filter: Record<string, unknown> = {}

    if (!isJ4) {
        filter.visibility = 'public'
        filter.isDeleted = { $ne: true }
    } else {
        if (!showDeleted) filter.isDeleted = { $ne: true }
    }

    if (category && category !== 'all') filter.category = category
    if (status && status !== 'all') filter.status = status
    if (department && department !== 'all' && isJ4) filter.department = department

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
            stepsToReproduce: 0,
            expectedResult: 0,
            actualResult: 0,
            missionForces: 0,
            missionObjectives: 0,
            missionStory: 0,
            missionPlayerExperience: 0,
            missionMechanics: 0,
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
    const department: string = rest.department ?? DEFAULT_DEPT[category as CommunityTicketCategory] ?? 'j4'

    // Mod request duplicate check
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
    const authorName = isAnonymous
        ? 'Anonymous'
        : (me.guild.displayName ?? me.username)

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
        attachments: [],
        mediaLinks: rest.mediaLinks ?? [],
        activityLog: [{
            action: 'created',
            actorId: me.id,
            actorName: me.guild.displayName ?? me.username,
            timestamp: now,
        }],
        // Optional fields
        ...(rest.modLink && { modLink: rest.modLink.trim() }),
        ...(rest.game && { game: rest.game }),
        ...(rest.gameOther && { gameOther: rest.gameOther }),
        ...(rest.featureCategory && { featureCategory: rest.featureCategory }),
        ...(rest.weblink && { weblink: rest.weblink.trim() }),
        ...(rest.justification && { justification: rest.justification.trim() }),
        ...(rest.stepsToReproduce && { stepsToReproduce: rest.stepsToReproduce.trim() }),
        ...(rest.expectedResult && { expectedResult: rest.expectedResult.trim() }),
        ...(rest.actualResult && { actualResult: rest.actualResult.trim() }),
        ...(rest.severity && { severity: rest.severity }),
        ...(rest.bugPlatformDetail && { bugPlatformDetail: rest.bugPlatformDetail.trim() }),
        ...(rest.missionForces && { missionForces: rest.missionForces.trim() }),
        ...(rest.missionObjectives && { missionObjectives: rest.missionObjectives.trim() }),
        ...(rest.missionStory && { missionStory: rest.missionStory.trim() }),
        ...(rest.missionPlayerExperience && { missionPlayerExperience: rest.missionPlayerExperience.trim() }),
        ...(rest.missionMechanics && { missionMechanics: rest.missionMechanics.trim() }),
        ...(rest.campaignPhases && { campaignPhases: rest.campaignPhases }),
        ...(rest.feedbackCategories && { feedbackCategories: rest.feedbackCategories }),
        ...(rest.feedbackType && { feedbackType: rest.feedbackType }),
        ...(rest.complainantName && { complainantName: rest.complainantName.trim() }),
        ...(rest.membersInvolved && { membersInvolved: rest.membersInvolved }),
        ...(rest.isStaffComplaint !== undefined && { isStaffComplaint: rest.isStaffComplaint }),
        ...(rest.desiredOutcome && { desiredOutcome: rest.desiredOutcome.trim() }),
        ...(rest.evidenceAcknowledged !== undefined && { evidenceAcknowledged: rest.evidenceAcknowledged }),
        ...(rest.nomineeName && { nomineeName: rest.nomineeName.trim() }),
        ...(rest.nomineeRank && { nomineeRank: rest.nomineeRank.trim() }),
        ...(rest.nominatorName && { nominatorName: rest.nominatorName.trim() }),
        ...(rest.awardType && { awardType: rest.awardType }),
        ...(rest.awardCategory && { awardCategory: rest.awardCategory }),
        ...(rest.awardRequirements && { awardRequirements: rest.awardRequirements.trim() }),
        ...(rest.awardDesignRef && { awardDesignRef: rest.awardDesignRef.trim() }),
        ...(rest.otherComments && { otherComments: rest.otherComments.trim() }),
    }

    await Db.communityTickets.insertOne(doc)

    return NextResponse.json(doc, { status: 201 })
}
