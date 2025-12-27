import {
    ApplicationCommandType,
    ChatInputCommandInteraction,
    TextChannel
} from 'discord.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default {
    name: 'count',
    description: 'Count for ❓ reactions',
    type: ApplicationCommandType.ChatInput,

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.channel || interaction.channel.isDMBased()) {
            return interaction.reply({
                content: 'This command must be used in a server channel.',
                ephemeral: true
            })
        }

        const channel = interaction.channel as TextChannel

        await interaction.reply({
            content: 'Started indefinite ❓ scan. Logging to console.',
            ephemeral: true
        })

        let lastId: string | undefined
        const scanned = new Set<string>() // prevents duplicate logs
        let num = 0

        while (true) {
            try {
                const messages = await channel.messages.fetch({
                    limit: 100,
                    before: lastId
                })

                // If we hit the start of the channel, loop back to newest
                if (messages.size === 0) {
                    lastId = undefined
                    await sleep(10_000) // idle wait before rescanning
                    continue
                }

                for (const message of messages.values()) {
                    if (scanned.has(message.id)) continue

                    const reaction = message.reactions.cache.find(
                        r => r.emoji.name === '❓'
                    )

                    if (reaction) {
                        console.log(
                            [
                                '❓ FOUND',
                                `Channel: #${channel.name}`,
                                `Author: ${message.author?.tag ?? 'Unknown'}`,
                                `Reactions: ${reaction.count}`,
                                `Content: ${message.content || '[No text]'}`,
                                `Link: ${message.url}`,
                                '-----------------------------'
                            ].join('\n')
                        )
                    }

                    scanned.add(message.id)
                }

                lastId = messages.last()?.id

                // Rate-limit compliance (VERY SAFE)
                await sleep(1200)
                num = num + 100
                console.log(`Scanning ${num} Msg`)

            } catch (err) {
                console.error('Scan error:', err)
                await sleep(15_000) // backoff on errors
            }
        }
    }
}
