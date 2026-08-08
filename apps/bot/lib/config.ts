function required(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`Missing required env var: ${name}`)
    return value
}

// Reuses the same variable names as apps/web where the concern is genuinely shared
// (Mongo connection, bot token/guild, site base URL) — see apps/web/CLAUDE.md's env var table.
const config: Config = {
    discord: {
        token: required('DISCORD_BOT_TOKEN'),
        guild: required('DISCORD_GUILD_ID'),
        memberRole: process.env.DISCORD_MEMBER_ROLE_ID ?? '',
        adminRole: process.env.DISCORD_ADMIN_ROLE_ID ?? '',
        notificationChannel: process.env.DISCORD_NOTIFICATION_CHANNEL_ID ?? '',
        songSubmissionChannel: process.env.DISCORD_SONG_SUBMISSION_CHANNEL_ID ?? '',
    },

    api: process.env.NEXT_PUBLIC_BASEURL ?? 'http://localhost:3000',

    mongo: {
        uri: required('MONGO_URI'),
        db: required('MONGO_DB'),
    },
}

export default config