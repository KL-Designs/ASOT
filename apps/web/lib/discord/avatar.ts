// Discord's own formula (mirrors discord.js's calculateUserDefaultAvatarIndex) for which of
// the 6 default avatar colours (embed/avatars/0.png .. 5.png) a user without a custom avatar
// gets, keyed off their user ID. The legacy discriminator%5 formula only applies to accounts
// still on the old username system, which is effectively none at this point.
export function defaultAvatarURL(userId: string): string {
    const index = Number(BigInt(userId) >> BigInt(22)) % 6
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

export function avatarURL(userId: string, avatarHash?: string | null, size?: number): string {
    if (!avatarHash) return defaultAvatarURL(userId)
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}${size ? `?size=${size}` : ''}`
}
