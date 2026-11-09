import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { sendDM } from '@/lib/discord/bot'
import { logAction } from '@/lib/logAction'
import { findNextSelection } from '@/lib/training/find-next-selection'
import { INDUCTION_PACK_ID, buildInductionDM, inductionRecipient, withInductionDefaults } from './induction-pack'

export async function loadInductionPack(): Promise<InductionPackConfig> {
    const doc = await Db.siteSettings.findOne({ _id: INDUCTION_PACK_ID })
    return withInductionDefaults(doc as Partial<InductionPackConfig> | null)
}

export interface Sender { id: string; name: string }

export type SendResult =
    | { ok: true; sendCount: number; sentAt: Date }
    | { ok: false; status: number; error: string }

/**
 * Send (or resend) the Induction Pack DM for a J1 application, and record it
 * on both the application and the member's induction progress. A resend keeps
 * the progress the member has already made.
 */
export async function sendInductionPack(applicationId: string, sender: Sender): Promise<SendResult> {
    if (!ObjectId.isValid(applicationId)) return { ok: false, status: 400, error: 'Invalid application id.' }
    const app = await Db.j1Applications.findOne({ _id: new ObjectId(applicationId) })
    if (!app) return { ok: false, status: 404, error: 'Application not found.' }
    if (app.status === 'rejected') return { ok: false, status: 409, error: 'This application was rejected.' }
    const recipientId = inductionRecipient(app)
    if (!recipientId) return { ok: false, status: 409, error: 'The application has no Discord ID to send to.' }

    const [config, next] = await Promise.all([loadInductionPack(), findNextSelection()])
    const name = app.inGameName || app.discordUsername || 'recruit'
    const dm = buildInductionDM(config, { name, selectionAt: next?.at ?? null, baseUrl: process.env.NEXT_PUBLIC_BASEURL ?? '' })

    try {
        await sendDM(recipientId, dm, 'induction_pack')
    } catch (err) {
        return { ok: false, status: 502, error: `Discord would not deliver the DM: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) }
    }

    const now = new Date()
    const sendCount = (app.inductionPack?.sendCount ?? 0) + 1
    await Db.j1Applications.updateOne({ _id: app._id }, {
        $set: { inductionPack: { sentAt: now, sentById: sender.id, sentByName: sender.name, recipientId, sendCount } },
    })
    await Db.inductionProgress.updateOne(
        { userId: recipientId },
        {
            $set: { userName: name, applicationId, sentAt: now, sentById: sender.id, sentByName: sender.name },
            $inc: { sendCount: 1 },
            $setOnInsert: { userId: recipientId, stepsDone: [] },
        },
        { upsert: true },
    )
    await logAction({
        action: sendCount > 1 ? 'j1.inductionPack.resend' : 'j1.inductionPack.send',
        category: 'member',
        performedBy: sender.id,
        performedByName: sender.name,
        department: 'j1',
        entityType: 'j1Application',
        entityId: applicationId,
        target: name,
        details: { recipientId, sendCount, nextSelection: next?.instanceRef ?? null },
    })
    return { ok: true, sendCount, sentAt: now }
}
