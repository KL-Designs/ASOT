import config from 'lib/config.ts'
import Discord, { MessageFlags } from 'discord.js'

const TIMEOUT_MS = 10_000

/**
 * The sign-up buttons on an operation's attendance post.
 *
 * `attendance.<operationId>.<yes|no>` — the post itself is made and kept up to
 * date by `apps/web` (lib/attendance/discord-post-sync.ts); the bot's only part
 * is this: pass the press on, and tell the member what happened.
 *
 * The answer is applied by web, not here. Who may sign up, whether sign-ups are
 * still open, and what declining does to a position already held are all
 * web's rules, and a second copy of them in the bot is how the two would come
 * to disagree. The reply is only ever seen by the member who pressed.
 */
export default async function (interaction: Discord.ButtonInteraction, args: string[]) {
    const [operationId, answer] = args
    if (!operationId || (answer !== 'yes' && answer !== 'no')) {
        return interaction.reply({ content: 'That button is no longer valid.', flags: MessageFlags.Ephemeral })
    }

    // Web can take a moment; Discord gives an interaction three seconds.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    if (!config.apiSecret) {
        return interaction.editReply('Sign-up from Discord is not set up on this bot yet. Use the website link on the post.')
    }

    try {
        const response = await fetch(`${config.apiInternal}/api/bot/attendance/rsvp`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiSecret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operationId,
                discordId: interaction.user.id,
                status: answer === 'yes' ? 'attending' : 'not_attending',
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const body = await response.json().catch(() => null) as { message?: string } | null
        return interaction.editReply(body?.message ?? 'That did not go through. Try again, or use the website link on the post.')
    } catch (err) {
        console.error('[attendance] sign-up button failed', config.apiInternal, err)
        return interaction.editReply('The website could not be reached. Try again in a minute, or use the website link on the post.')
    }
}
