import Db from '@/lib/mongo'
import { botRequest, isDevModeEnabled, upsertChannelPost } from '@/lib/discord/bot'
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
 * `fresh` is J3's "Send post now": the old message is deleted and a new one
 * goes up, so it lands at the bottom of the channel again. It still needs a
 * channel, but not the switch, so a one-off post works while it is disabled.
 *
 * Never throws: a Discord failure is recorded on the settings for J3 to see.
 */
export async function syncSelectionCountdown(now = new Date(), opts: { fresh?: boolean } = {}): Promise<CountdownAction | 'failed' | 'held'> {
    const config = await loadCountdownConfig()
    const channelId = countdownChannel(config)
    const next = config.enabled || opts.fresh ? await findNextSelection(now) : null
    const post = buildCountdownPost(config, countdownDate(config, next, now), process.env.NEXT_PUBLIC_BASEURL ?? '')
    const fp = fingerprint(channelId, post)
    let action = countdownAction(config, channelId, fp)
    if (opts.fresh && channelId) {
        // Developer mode holds every Discord message back: say so, and leave the old post where it is.
        if (await isDevModeEnabled()) return 'held'
        if (config.messageId && config.postedChannelId) {
            await botRequest('DELETE', `/channels/${config.postedChannelId}/messages/${config.messageId}`).catch(() => null)
        }
        action = 'post'
    }
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
        if (!messageId) return 'held'
        await Db.siteSettings.updateOne(
            { _id: SELECTION_COUNTDOWN_ID },
            { $set: { messageId, postedChannelId: channelId, postedFingerprint: fp, postedAt: now, ...(action === 'post' ? { sentAt: now } : {}) }, $unset: { lastError: '' } },
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
