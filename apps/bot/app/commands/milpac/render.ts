import Discord, { AttachmentBuilder } from 'discord.js'
import config from 'lib/config.ts'

/**
 * Shared body of `/milpac uniform` and `/milpac medals`.
 *
 * The bot asks apps/web to render rather than calling the render service
 * itself. Building the payload — awards to ribbons, qualifications to badges,
 * ORBAT section to corps badge — depends on web's schema, and a second
 * implementation here is the exact drift apps/milpac/PLAN.md §3 describes.
 * The bot therefore knows only a Discord id and which of two images it wants.
 */

/** Renders take seconds and compound with a cold service; the deferral allows 15 minutes. */
const TIMEOUT_MS = 60_000

const LABEL = {
    uniform: { noun: 'uniform', title: 'Uniform' },
    medals: { noun: 'medal display', title: 'Medals' },
} as const

export async function renderMilpac(
    interaction: Discord.ChatInputCommandInteraction,
    type: 'uniform' | 'medals',
) {
    // Public by design — the point of the command is to show the unit.
    await interaction.deferReply()

    if (!config.apiSecret) {
        return interaction.editReply(
            'The milpac renderer is not configured on this bot — `BOT_API_SECRET` is unset.',
        )
    }

    const target = interaction.options.getUser('member') ?? interaction.user
    const label = LABEL[type]

    let response: Response
    try {
        response = await fetch(`${config.apiInternal}/api/bot/milpac/${target.id}?type=${type}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiSecret}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    } catch (err) {
        console.error('[milpac] bot render request failed', err)
        return interaction.editReply(
            `Could not reach the milpac renderer. Try again in a moment.`,
        )
    }

    if (!response.ok) {
        // The route distinguishes these deliberately, so relay the distinction
        // rather than collapsing every failure into "something went wrong".
        const message =
            response.status === 404 ? `**${target.displayName}** has no milpac on record.`
            : response.status === 422 ? `**${target.displayName}**'s milpac names artwork that does not exist — a staff member needs to look at their record.`
            : response.status === 401 ? 'The milpac renderer rejected this bot\'s credentials.'
            : 'The milpac renderer is unavailable right now.'
        return interaction.editReply(message)
    }

    const png = Buffer.from(await response.arrayBuffer())
    const file = new AttachmentBuilder(png, { name: `${target.username}-${type}.png` })

    return interaction.editReply({
        content: `**${target.displayName}** — ${label.title}`,
        files: [file],
    })
}

/** The optional member picker both subcommands share. */
export const memberOption = {
    name: 'member',
    description: 'Whose milpac to show — defaults to your own',
    type: Discord.ApplicationCommandOptionType.User,
    required: false,
} as const

export { LABEL }
