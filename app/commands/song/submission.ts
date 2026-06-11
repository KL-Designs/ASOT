import Discord, { ApplicationCommandOptionType } from 'discord.js'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import Colors from 'lib/colors.ts'

const TEMP_DIR = './data/songs/temp'
const DISCORD_FILE_LIMIT_BYTES = 25 * 1024 * 1024

const YOUTUBE_URL_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w\-]{11}/

class SongProcessor {
    constructor() {
        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true })
        }
    }

    isYouTubeUrl(url: string): boolean {
        return YOUTUBE_URL_REGEX.test(url)
    }

    getVideoInfo(url: string): Promise<{ title: string, duration: number }> {
        return new Promise((resolve, reject) => {
            const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', url])
            let stdout = ''

            proc.stdout.on('data', (chunk: Buffer) => stdout += chunk.toString())

            proc.on('close', (code) => {
                if (code !== 0) return reject(new Error('Could not fetch video info'))
                try {
                    const info = JSON.parse(stdout)
                    resolve({ title: info.title, duration: info.duration || 0 })
                } catch {
                    reject(new Error('Could not parse video info'))
                }
            })

            proc.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'ENOENT') reject(new Error('yt-dlp not found. Please install yt-dlp and ensure it is in PATH.'))
                else reject(err)
            })
        })
    }

    downloadAndConvert(url: string, id: string): Promise<string> {
        const outputTemplate = path.join(TEMP_DIR, `${id}.%(ext)s`)
        const outputPath = path.join(TEMP_DIR, `${id}.ogg`)

        return new Promise((resolve, reject) => {
            const proc = spawn('yt-dlp', [
                '-x',
                '--audio-format', 'vorbis',
                '--audio-quality', '4',
                '--postprocessor-args', 'ffmpeg:-ar 44100',
                '--no-playlist',
                '-o', outputTemplate,
                url
            ])

            proc.on('close', (code) => {
                if (code !== 0) return reject(new Error(`yt-dlp exited with code ${code}`))
                if (!fs.existsSync(outputPath)) return reject(new Error('Conversion failed: output file not found'))
                resolve(outputPath)
            })

            proc.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'ENOENT') reject(new Error('yt-dlp not found. Please install yt-dlp and ensure it is in PATH.'))
                else reject(err)
            })
        })
    }

    getFileSizeBytes(filePath: string): number {
        return fs.statSync(filePath).size
    }

    cleanup(filePath: string): void {
        try { fs.unlinkSync(filePath) } catch { /* already gone */ }
    }
}

const Processor = new SongProcessor()

export default {
    name: 'submission',
    description: 'Submit a song for the ASOT playlist',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'url',
            description: 'YouTube URL of the song',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            response(interaction: Discord.AutocompleteInteraction) {
                const input = interaction.options.getString('url') || ''

                if (!Processor.isYouTubeUrl(input)) {
                    return interaction.respond([])
                }

                return interaction.respond([{ name: input, value: input }])
            }
        } as AutocompleteOption,

        {
            name: 'name',
            description: 'Song name',
            type: ApplicationCommandOptionType.String,
            required: true,
            min_length: 1,
            max_length: 100
        },
        {
            name: 'artist',
            description: 'Artist name',
            type: ApplicationCommandOptionType.String,
            required: true,
            min_length: 1,
            max_length: 100
        },
        {
            name: 'genre',
            description: 'Genre (e.g. Rock, Electronic, Classical)',
            type: ApplicationCommandOptionType.String,
            required: true,
            min_length: 1,
            max_length: 50
        },
    ],

    async execute(interaction: Discord.ChatInputCommandInteraction) {
        const member = interaction.member as Discord.GuildMember
        if (interaction.guildId !== '1366755400023670824' && !member.roles.cache.some(r => r.name === 'J7 - Community Development')) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true })
        }

        const url    = interaction.options.getString('url', true)
        const name   = interaction.options.getString('name', true)
        const artist = interaction.options.getString('artist', true)
        const genre  = interaction.options.getString('genre', true)

        if (!Processor.isYouTubeUrl(url)) {
            return interaction.reply({ content: 'Please provide a valid YouTube URL.', ephemeral: true })
        }

        await interaction.deferReply({ ephemeral: true })

        let oggPath: string | null = null

        try {
            const { title } = await Processor.getVideoInfo(url)

            oggPath = await Processor.downloadAndConvert(url, interaction.id)

            const sizeBytes = Processor.getFileSizeBytes(oggPath)
            if (sizeBytes > DISCORD_FILE_LIMIT_BYTES) {
                throw new Error(`Converted file is too large to upload (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Discord's limit is 25 MB.`)
            }

            const embed = new Discord.EmbedBuilder()
                .setTitle(name)
                .setColor(Colors.secondary)
                .setTimestamp()
                .addFields([
                    { name: 'Artist', value: artist, inline: true },
                    { name: 'Genre', value: genre, inline: true },
                    { name: 'Submitted by', value: `${interaction.user} (${interaction.user.username})`, inline: false },
                    { name: 'YouTube', value: url, inline: false },
                    { name: 'Video Title', value: title, inline: false },
                ])

            const safeName = name.replace(/[^a-z0-9]/gi, '_')
            const attachment = new Discord.AttachmentBuilder(oggPath, { name: `${safeName}.ogg` })

            await interaction.user.send({ embeds: [embed], files: [attachment] })

            await interaction.editReply({ content: `Your submission for **${name}** by **${artist}** has been sent to your DMs!` })

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'An unknown error occurred.'
            try {
                await interaction.editReply({ content: `Submission failed: ${msg}` })
            } catch {
                await interaction.reply({ content: `Submission failed: ${msg}`, ephemeral: true })
            }
        } finally {
            if (oggPath) Processor.cleanup(oggPath)
        }
    }
} as ChatSubcommand
