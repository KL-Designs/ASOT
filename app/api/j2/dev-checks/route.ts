import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/** Check week offsets by op type */
const CAMPAIGN_CHECK_WEEKS = [16, 12, 10, 8, 6, 4] as const
const SINGLE_CHECK_WEEKS   = [12, 10, 8, 6, 4] as const

export interface DevCheckInfo {
    checkId: string
    weeksOut: number
    dueDate: string      // ISO
    isOverdue: boolean
    daysUntil: number
    completion?: {
        completedAt: string
        completedByName: string
        reviewerName?: string
        comments?: string
        outcome?: string
    }
    task?: {
        _id: string
        assignedTo: string
        assignedToName: string
        status: string
        createdAt: string
        escalatedAt?: string
    }
}

export interface DevCheckOpRow {
    opId: string
    opTitle: string
    opDate: string
    opStatus: string
    isCampaign: boolean
    campaignId?: string
    campaignName?: string
    referenceDate: string  // campaign startDate or op date
    checks: DevCheckInfo[]
}

function addWeeksDelta(base: Date, weeksOut: number): Date {
    const d = new Date(base)
    d.setDate(d.getDate() - weeksOut * 7)
    return d
}

/** GET /api/j2/dev-checks — list all In Development ops with check statuses */
export async function GET(req: NextRequest) {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2) &&
            !client.hasRoles(me, [PERMISSIONS.departmentLeads.j2[0]])) {
            // Also allow J2 members to view
            if (!client.hasRoles(me, PERMISSIONS.departments.j2)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') ?? 'active'  // active | overdue | completed | all

    // Fetch ops — only 'In Development' and 'Active' for the checks view
    const statusFilter = filter === 'all'
        ? { $in: ['In Development', 'Active', 'Upcoming'] as const }
        : { $in: ['In Development', 'Active'] as const }

    const ops = await Db.operations
        .find(
            { status: statusFilter, deletedAt: { $exists: false } },
            { projection: { title: 1, date: 1, status: 1, campaignId: 1, missionDevelopment: 1 } }
        )
        .sort({ date: 1 })
        .toArray()

    // Batch-fetch campaigns for campaign ops
    const campaignIds = [...new Set(ops.filter(o => o.campaignId).map(o => o.campaignId!.toString()))]
    const campaigns = campaignIds.length > 0
        ? await Db.operationCampaigns
            .find({ _id: { $in: campaignIds.map(id => new ObjectId(id)) } },
                  { projection: { name: 1, startDate: 1 } })
            .toArray()
        : []
    const campaignMap = new Map(campaigns.map(c => [c._id.toString(), c]))

    // Batch-fetch all dev_check tasks for these ops
    const opIds = ops.map(o => o._id.toString())
    const tasks = opIds.length > 0
        ? await Db.tasks
            .find({ type: 'dev_check', relatedId: { $in: opIds }, completedAt: { $exists: false } })
            .project<{
                _id: import('mongodb').ObjectId
                relatedId: string
                missionDevCheckId: string
                assignedTo: string
                assignedToName: string
                status: string
                createdAt: Date
                escalatedAt?: Date
            }>({ relatedId: 1, missionDevCheckId: 1, assignedTo: 1, assignedToName: 1, status: 1, createdAt: 1, escalatedAt: 1 })
            .toArray()
        : []

    // Group tasks by opId+checkId
    const taskMap = new Map<string, typeof tasks[number]>()
    for (const t of tasks) {
        taskMap.set(`${t.relatedId}:${t.missionDevCheckId}`, t)
    }

    const now = new Date()
    const rows: DevCheckOpRow[] = []

    for (const op of ops) {
        const opId = op._id.toString()
        const campaign = op.campaignId ? campaignMap.get(op.campaignId.toString()) : null
        const isCampaign = !!campaign?.startDate
        const referenceDate = isCampaign
            ? new Date(campaign!.startDate!)
            : new Date(op.date)

        const weekOffsets = isCampaign ? CAMPAIGN_CHECK_WEEKS : SINGLE_CHECK_WEEKS
        const completions = (op.missionDevelopment as MissionDevelopment | undefined)?.completions ?? {}

        const checks: DevCheckInfo[] = weekOffsets.map(w => {
            const checkId = `w${w}`
            const dueDate = addWeeksDelta(referenceDate, w)
            const msUntil = dueDate.getTime() - now.getTime()
            const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24))
            const task = taskMap.get(`${opId}:${checkId}`)
            const completion = completions[checkId]

            return {
                checkId,
                weeksOut: w,
                dueDate: dueDate.toISOString(),
                isOverdue: !completion && daysUntil < 0,
                daysUntil,
                completion: completion
                    ? {
                        completedAt: completion.completedAt,
                        completedByName: completion.completedByName,
                        reviewerName: completion.reviewerName,
                        comments: completion.comments,
                        outcome: completion.outcome,
                    }
                    : undefined,
                task: task
                    ? {
                        _id: task._id.toString(),
                        assignedTo: task.assignedTo,
                        assignedToName: task.assignedToName,
                        status: task.status,
                        createdAt: task.createdAt.toISOString(),
                        escalatedAt: task.escalatedAt?.toISOString(),
                    }
                    : undefined,
            }
        })

        // Apply filter
        const hasOverdue  = checks.some(c => c.isOverdue && !c.completion)
        const hasUpcoming = checks.some(c => !c.completion && !c.isOverdue)
        const allDone     = checks.every(c => !!c.completion)

        if (filter === 'overdue'   && !hasOverdue)  continue
        if (filter === 'completed' && !allDone)      continue
        if (filter === 'active'    && allDone)       continue

        rows.push({
            opId,
            opTitle: op.title,
            opDate: new Date(op.date).toISOString(),
            opStatus: op.status ?? 'In Development',
            isCampaign,
            campaignId:   campaign?._id.toString(),
            campaignName: campaign?.name,
            referenceDate: referenceDate.toISOString(),
            checks,
        })
    }

    return NextResponse.json({ rows })
}
