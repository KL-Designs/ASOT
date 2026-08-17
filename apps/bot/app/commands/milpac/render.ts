import Discord, { AttachmentBuilder, MessageFlags } from 'discord.js'
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
    dossier: { noun: 'personnel file', title: 'Personnel File' },
} as const

/** The private-reply toggle. Read before deferring — see renderMilpac. */
export const hiddenOption = {
    name: 'hidden',
    description: 'Show the reply only to you',
    type: Discord.ApplicationCommandOptionType.Boolean,
    required: false,
} as const

/**
 * Reports a failure to the caller alone.
 *
 * A public reply is deferred publicly because the successful case is the point
 * of the command, and Discord fixes a reply's visibility at deferral. So a
 * failure withdraws the public placeholder and follows up privately instead —
 * nobody else needs to watch someone else's command not work.
 *
 * An already-private reply has no placeholder to withdraw, so it is simply
 * edited. Deleting it first would leave the caller with nothing on screen
 * between the two calls.
 */
async function fail(interaction: Discord.ChatInputCommandInteraction, message: string, hidden: boolean) {
    if (hidden) return interaction.editReply({ content: message })
    // Best-effort: if the placeholder is already gone, the follow-up still matters.
    await interaction.deleteReply().catch(() => { })
    return interaction.followUp({ content: message, flags: MessageFlags.Ephemeral })
}

export async function renderMilpac(
    interaction: Discord.ChatInputCommandInteraction,
    type: 'uniform' | 'medals' | 'dossier',
) {
    // Read before deferring: Discord fixes a reply's visibility at deferral,
    // so this cannot be consulted afterwards.
    const hidden = interaction.options.getBoolean('hidden') ?? false

    // Public by default — the point of the command is to show the unit.
    await interaction.deferReply({ flags: hidden ? MessageFlags.Ephemeral : undefined })

    if (!config.apiSecret) {
        return fail(interaction, 'The milpac renderer is not configured on this bot — `BOT_API_SECRET` is unset.', hidden)
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
        console.error('[milpac] bot render request failed', config.apiInternal, err)
        // The reason is worth showing, not just logging: this message is private
        // to whoever ran the command, and "timed out" and "refused" point at
        // completely different problems.
        const reason = (err as Error)?.name === 'TimeoutError'
            ? `it did not respond within ${TIMEOUT_MS / 1000}s`
            : `the connection failed (\`${(err as Error)?.message ?? 'unknown'}\`)`
        return fail(interaction, `Could not reach the milpac renderer at \`${config.apiInternal}\` — ${reason}.`, hidden)
    }

    if (!response.ok) {
        // The route distinguishes these deliberately, so relay the distinction
        // rather than collapsing every failure into "something went wrong".
        const message =
            response.status === 404 ? `**${target.displayName}** has no milpac on record.`
            : response.status === 422 ? `**${target.displayName}**'s milpac names artwork that does not exist — a staff member needs to look at their record.`
            : response.status === 401 ? 'The milpac renderer rejected this bot\'s credentials — `BOT_API_SECRET` does not match the website\'s.'
            : `The milpac renderer is unavailable right now (${response.status}).`
        return fail(interaction, message, hidden)
    }

    const png = Buffer.from(await response.arrayBuffer())
    const file = new AttachmentBuilder(png, { name: `${target.username}-${type}.png` })

    return interaction.editReply({
        content: `**${target.displayName}** — ${label.title}`,
        files: [file],
        components: linkRow(response),
    })
}

/**
 * The section buttons, built from what web sent back.
 *
 * Web owns the URL structure — it decides which sections exist and which are
 * worth offering, so a member with no public kit gets no Kits button without
 * the bot knowing what a kit is. A fourth section added to the site produces a
 * fourth button here with no change to this file.
 *
 * `config.api`, never `config.apiInternal`: this URL is clicked by a member.
 */
function linkRow(response: Response): Discord.ActionRowBuilder<Discord.ButtonBuilder>[] {
    let links: { label: string; path: string }[]
    try {
        const parsed = JSON.parse(response.headers.get('x-milpac-links') ?? '[]')
        // A malformed header must cost the buttons, not the whole reply:
        // ButtonBuilder throws on an invalid URL and that would swallow the card.
        links = Array.isArray(parsed)
            ? parsed.filter(l => typeof l?.label === 'string' && typeof l?.path === 'string' && l.path.startsWith('/'))
            : []
    } catch {
        return []
    }

    if (links.length === 0) return []

    const base = config.api.replace(/\/+$/, '')
    return [new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
        links.slice(0, 5).map(l => new Discord.ButtonBuilder()
            .setStyle(Discord.ButtonStyle.Link)
            .setLabel(l.label)
            .setURL(`${base}${l.path}`)),
    )]
}

/** The optional member picker both subcommands share. */
export const memberOption = {
    name: 'member',
    description: 'Whose milpac to show — defaults to your own',
    type: Discord.ApplicationCommandOptionType.User,
    required: false,
} as const

export { LABEL }
