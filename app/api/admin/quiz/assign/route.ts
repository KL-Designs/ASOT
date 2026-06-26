import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification, createNotificationForRole } from '@/lib/notifications'
import { sendTaskAssignedDM } from '@/lib/discord/bot'
import BCT_QUIZ from '@/lib/quiz-data'
import { logAction } from '@/lib/logAction'

// POST /api/admin/quiz/assign
// Assigns the BCT quiz to a recruit. Creates a QuizAttempt + Task + notifications.
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.quiz.assign)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { userId, userName, timeLimitMinutes, timerModifiedReason } = body

    if (!userId || !userName) {
        return NextResponse.json({ error: 'userId and userName are required' }, { status: 400 })
    }

    const defaultTime = BCT_QUIZ.timeLimitMinutes
    const resolvedTime: number = typeof timeLimitMinutes === 'number' && timeLimitMinutes > 0
        ? timeLimitMinutes
        : defaultTime
    const timerModified = resolvedTime !== defaultTime

    if (timerModified && !timerModifiedReason?.trim()) {
        return NextResponse.json({ error: 'A reason is required when modifying the timer' }, { status: 400 })
    }

    const trainerName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    // Check recruit doesn't already have a pending/in-progress attempt
    const existing = await Db.quizAttempts.findOne({
        quizId: BCT_QUIZ.id,
        userId,
        status: { $in: ['assigned', 'in_progress', 'submitted', 'reviewing'] },
    })
    if (existing) {
        return NextResponse.json({ error: 'This recruit already has an active quiz attempt' }, { status: 409 })
    }

    // Create the attempt first (we need its ID for the task actionUrl)
    const attemptResult = await Db.quizAttempts.insertOne({
        quizId: BCT_QUIZ.id,
        assignmentTaskId: '', // filled in below after task is created
        userId,
        userName,
        assignedBy: me.id,
        assignedByName: trainerName,
        timeLimitMinutes: resolvedTime,
        ...(timerModified ? { timerModifiedReason: timerModifiedReason.trim() } : {}),
        status: 'assigned',
        answers: [],
        reviewHistory: [],
        createdAt: new Date(),
    } as QuizAttempt)

    const attemptId = attemptResult.insertedId.toString()
    const quizUrl = `/community/quiz/${attemptId}`

    // Create the task
    const task: Omit<Task, '_id'> = {
        title: 'BCT Confirmation Quiz',
        description: 'You have been assigned the BCT Confirmation Quiz. Click the link to begin.',
        assignedTo: userId,
        assignedToName: userName,
        assignedBy: me.id,
        assignedByName: trainerName,
        status: 'pending',
        type: 'quiz_assigned',
        department: 'j3',
        actionUrl: quizUrl,
        relatedId: attemptId,
        createdAt: new Date(),
    }

    const taskResult = await Db.tasks.insertOne(task as Task)
    const taskId = taskResult.insertedId.toString()

    // Back-fill the task ID into the attempt
    await Db.quizAttempts.updateOne(
        { _id: attemptResult.insertedId },
        { $set: { assignmentTaskId: taskId } }
    )

    // In-app notification to recruit
    await createNotification({
        userId,
        type: 'quiz_assigned',
        title: 'BCT Confirmation Quiz assigned',
        body: `Your trainer has assigned you the BCT Confirmation Quiz. Click here to begin.`,
        actionUrl: quizUrl,
        relatedId: attemptId,
    })

    // Discord DM to recruit
    sendTaskAssignedDM(userId, 'BCT Confirmation Quiz', 'You have been assigned the BCT Confirmation Quiz. Click the link in your notifications to begin.', quizUrl)
        .catch(err => console.error('[quiz/assign] DM failed for', userId, err))

    // If timer was modified — notify J3 Team Leads
    if (timerModified) {
        await createNotificationForRole('J3-Team Lead', {
            type: 'system',
            title: 'Quiz timer modified',
            body: `${trainerName} assigned the BCT quiz to ${userName} with a modified timer (${resolvedTime} min instead of ${defaultTime} min). Reason: ${timerModifiedReason?.trim()}`,
            actionUrl: `/dashboard/quiz/review/${attemptId}`,
            relatedId: attemptId,
        })
    }

    logAction({
        action: 'quiz.assign',
        category: 'training',
        performedBy: me.id,
        performedByName: trainerName,
        department: 'j3',
        entityType: 'quiz_attempt',
        entityId: attemptId,
        target: userName,
        details: { quizId: BCT_QUIZ.id, timeLimitMinutes: resolvedTime, timerModified },
    }).catch(console.error)

    return NextResponse.json({ ok: true, attemptId, taskId })
}
