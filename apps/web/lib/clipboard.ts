/**
 * Copy-to-clipboard, shared by every client component that needs it.
 *
 * Prefers the Clipboard API in a secure context, and falls back to an
 * off-screen-textarea `execCommand('copy')` for a dev server reached over a
 * LAN IP (not a secure context) or a browser without the API. The Clipboard
 * API requires a secure context: localhost qualifies, but a LAN IP does not,
 * and the promise rejects.
 *
 * Plain DOM code, imported by client components — must not import anything
 * server-only.
 */
function legacyCopy(text: string): boolean {
    const field = document.createElement('textarea')
    field.value = text
    // Off-screen rather than hidden: display:none and visibility:hidden are both
    // unselectable, and execCommand('copy') copies the selection.
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '-1000px'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    try {
        return document.execCommand('copy')
    } catch {
        return false
    } finally {
        document.body.removeChild(field)
    }
}

export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // A rejected clipboard write (permission, insecure context) is still
        // worth one attempt at the old path before admitting failure.
    }
    return legacyCopy(text)
}
