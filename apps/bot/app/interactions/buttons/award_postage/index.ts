import config from 'lib/config.ts'
import Discord, { MessageFlags } from 'discord.js'

const TIMEOUT_MS = 10_000

/**
 * The Yes / No buttons on the physical awards DM (row 384), `award_postage.<yes|no>`.
 *
 * Web sends the DM and applies the answer (`/api/bot/award-postage`); the bot
 * only passes the press on. Only yes or no is recorded: members send their
 * postal details to LT GEN Thomas directly.
 */
export default async function (interaction: Discord.ButtonInteraction, args: string[]) {
    const [answer] = args
    if (answer !== 'yes' && answer !== 'no') {
        return interaction.reply({ content: 'That button is no longer valid.', flags: MessageFlags.Ephemeral })
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    if (!config.apiSecret) return interaction.editReply('This is not set up on the bot yet. Please reply to LT GEN Thomas directly.')

    try {
        const response = await fetch(`${config.apiInternal}/api/bot/award-postage`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiSecret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId: interaction.user.id, answer }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const body = await response.json().catch(() => null) as { message?: string } | null
        return interaction.editReply(body?.message ?? 'That did not go through. Try again, or reply to LT GEN Thomas directly.')
    } catch (err) {
        console.error('[award_postage] button failed', config.apiInternal, err)
        return interaction.editReply('The website could not be reached. Try again in a minute, or reply to LT GEN Thomas directly.')
    }
}
