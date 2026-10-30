/**
 * Absolute URL for something the site serves at a relative path, for places
 * outside the site (Discord embeds) that cannot resolve one. Pure, and free
 * of Node imports so client components can share the modules that use it.
 */
export function absoluteUrl(url: string | undefined, baseUrl: string): string | undefined {
    if (!url) return undefined
    if (/^https?:\/\//i.test(url)) return url
    return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}
