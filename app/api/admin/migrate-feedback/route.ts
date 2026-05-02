import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

// Status mapping: old feedback statuses → new ticket status + tags
function mapStatus(oldStatus: string): { status: CommunityTicketStatus; ticketTags: string[] } {
    switch (oldStatus) {
        case 'in_progress':   return { status: 'in_review', ticketTags: [] }
        case 'investigating': return { status: 'in_review', ticketTags: [] }
        case 'fixed':         return { status: 'closed',    ticketTags: ['resolved'] }
        case 'implemented':   return { status: 'closed',    ticketTags: ['implemented'] }
        case 'wont_fix':      return { status: 'closed',    ticketTags: ['denied'] }
        default:              return { status: 'open',       ticketTags: [] }
    }
}

// Type mapping: old feedback type → ticket category + subtype
function mapType(type: string): { category: CommunityTicketCategory; subtype: CommunityTicketSubtype } {
    if (type === 'feature') return { category: 'request', subtype: 'feature-request' }
    return { category: 'bug', subtype: 'bug-website' }
}

// GET — run the migration (browser-friendly)
export { POST as GET }

// POST — run the migration
export async function POST() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const feedbacks = await Db.feedbackLegacy.find({}).toArray()
    if (feedbacks.length === 0) {
        return NextResponse.json({ message: 'No feedbacks to migrate.', migrated: 0, skipped: 0 })
    }

    const existingIds = new Set(
        (await Db.communityTicketsMigrationTarget.find({ _id: { $in: feedbacks.map(f => f._id) } }, { projection: { _id: 1 } }).toArray())
            .map(t => t._id.toString())
    )

    let migrated = 0
    let skipped = 0
    let commentsMigrated = 0
    const errors: string[] = []

    for (const fb of feedbacks) {
        const idStr = fb._id.toString()

        if (existingIds.has(idStr)) {
            skipped++
            continue
        }

        try {
            const { status, ticketTags } = mapStatus(fb.status)
            const { category, subtype } = mapType(fb.type)
            const now = fb.createdAt ?? new Date()

            const ticket: CommunityTicket = {
                _id: fb._id,
                category,
                subtype,
                visibility: 'public',
                status,
                statuses: [status],
                ticketTags,
                title: fb.title,
                description: fb.description,
                authorId: fb.authorId,
                authorName: fb.authorName,
                authorAvatarId: fb.authorAvatarId,
                isAnonymous: false,
                createdAt: fb.createdAt,
                updatedAt: fb.updatedAt,
                isDeleted: false,
                upvotes: fb.upvotes ?? [],
                downvotes: [],
                voteScore: fb.upvoteCount ?? 0,
                commentCount: fb.commentCount ?? 0,
                department: 'j4',
                departments: ['j4'],
                tags: [],
                attachments: fb.attachments ?? [],
                mediaLinks: [],
                activityLog: [{
                    action: 'created',
                    actorId: fb.authorId,
                    actorName: fb.authorName,
                    timestamp: now,
                }],
            }

            await Db.communityTicketsMigrationTarget.insertOne(ticket)

            // Copy attachment files
            const srcDir = path.resolve(`./uploads/feedback/${idStr}`)
            const dstDir = path.resolve(`./uploads/community-tickets/${idStr}`)
            if (fs.existsSync(srcDir) && (fb.attachments?.length ?? 0) > 0) {
                fs.mkdirSync(dstDir, { recursive: true })
                for (const filename of fb.attachments ?? []) {
                    const srcFile = path.join(srcDir, filename)
                    const dstFile = path.join(dstDir, filename)
                    if (fs.existsSync(srcFile)) {
                        fs.copyFileSync(srcFile, dstFile)
                    }
                }
            }

            // Migrate comments
            const oldComments = await Db.feedbackLegacyComments
                .find({ feedbackId: fb._id })
                .sort({ createdAt: 1 })
                .toArray()

            for (const c of oldComments) {
                const ticketComment: CommunityTicketComment = {
                    _id: c._id,
                    ticketId: fb._id,
                    authorId: c.authorId,
                    authorName: c.authorName,
                    content: c.content,
                    createdAt: c.createdAt,
                    isEdited: false,
                    isDeleted: false,
                    upvotes: [],
                    downvotes: [],
                    voteScore: 0,
                }
                await Db.communityTicketCommentsMigrationTarget.insertOne(ticketComment).catch(() => {})
                commentsMigrated++
            }

            migrated++
        } catch (e: unknown) {
            errors.push(`${idStr}: ${e instanceof Error ? e.message : String(e)}`)
        }
    }

    return NextResponse.json({ migrated, skipped, commentsMigrated, errors })
}
