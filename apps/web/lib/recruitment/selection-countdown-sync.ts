import Db from '@/lib/mongo'
import { upsertChannelPost } from '@/lib/discord/bot'
import { findNextSelection } from '@/lib/training/find-next-selection'
import {
    SELECTION_COUNTDOWN_ID, buildCountdownPost, countdownAction, countdownDate, fingerprint, withDefaults,
    type CountdownAction,
} from './selection-countdown'

export async function loadCountdownConfig(): Promise<SelectionCountdownConfig> {
    const doc = await Db.siteSettings.findOne({ _id: SELECTION_COUNTDOWN_ID })
    return withDefaults(doc as Partial<SelectionCountdownConfig> | null)
}

export function countdownChannel(config: SelectionCountdownConfig): string {
    return config.channelId?.trim() || process.env.DISCORD_WANT_TO_JOIN_CHANNEL_ID?.trim() || ''
}

/**
 * Keep the Want to Join post in step (row 212). Called by the cron every few
 * minutes and straight after J3 saves the settings. It posts once, then edits
 * that same message whenever the date, override, text or image changes —
 * including the moment a Selection's Session 1 passes and the next one (or
 * "To be confirmed") takes over. Disabled means it stops touching the post.
 *
 * Never throws: a Discord failure is recorded on the settings for J3 to see.
 */
export async function syncSelectionCountdown(now = new Date()): Promise<CountdownAction | 'failed'> {
    const config = await loadCountdownConfig()
    const channelId = countdownChannel(config)
    const next = config.enabled ? await findNextSelection(now) : null
    const post = buildCountdownPost(config, countdownDate(config, next, now), process.env.NEXT_PUBLIC_BASEURL ?? '')
    const fp = fingerprint(channelId, post)
    const action = countdownAction(config, channelId, fp)
    if (action === 'off' || action === 'unconfigured' || action === 'unchanged') return action

    const send = (messageId?: string) => upsertChannelPost({ channelId, messageId, payload: post, messageType: 'selection_countdown' })
    try {
        let messageId: string | null
        try {
            messageId = await send(action === 'edit' ? config.messageId : undefined)
        } catch (err) {
            // Somebody deleted the post in Discord: put a new one up.
            if (action === 'edit' && /→ 404/.test(String(err))) messageId = await send(undefined)
            else throw err
        }
        // Null means developer mode held it back; record nothing so it goes out once the mode is off.
        if (!messageId) return action
        await Db.siteSettings.updateOne(
            { _id: SELECTION_COUNTDOWN_ID },
            { $set: { messageId, postedChannelId: channelId, postedFingerprint: fp, postedAt: now }, $unset: { lastError: '' } },
            { upsert: true },
        )
        return action
    } catch (err) {
        await Db.siteSettings.updateOne(
            { _id: SELECTION_COUNTDOWN_ID },
            { $set: { lastError: String(err instanceof Error ? err.message : err).slice(0, 300) } },
            { upsert: true },
        ).catch(() => {})
        console.error('[selection-countdown] sync failed:', err)
        return 'failed'
    }
}
