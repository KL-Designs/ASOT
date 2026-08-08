import unzipper from 'unzipper'
import sanitizeHtml from 'sanitize-html'
import fs from 'fs'
import path from 'path'
import { ObjectId } from 'mongodb'

const UPLOAD_DIR = '../../storage/uploads/training-docs'
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

// CSS properties worth preserving from Google Docs .cNN class rules
const RELEVANT_PROPS = ['font-weight', 'font-style', 'text-decoration', 'text-align', 'margin-left'] as const
// Default/neutral values that add no visual information
const SKIP_VALUES: Record<string, string[]> = {
    'font-weight':    ['400', 'normal'],
    'text-decoration': ['none'],
    'text-align':     ['left'],    // browser default — skip to reduce noise
    'margin-left':    ['0', '0pt', '0px', '0em'],
}

export interface ParsedDoc {
    htmlContent: string
    imageFiles:  string[]
}

function ensureUploadDir() {
    if (!fs.existsSync('uploads'))   fs.mkdirSync('uploads')
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR)
}

// Build a map of Google Docs obfuscated class name → inline style string
// e.g. "c21" → "font-weight:700"  |  "c18" → "text-align:center;margin-left:36pt"
function parseClassStyles(html: string): Map<string, string> {
    const map = new Map<string, string>()
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
    if (!styleMatch) return map

    const css = styleMatch[1]
    // Only match Google Docs' obfuscated .cNN class selectors
    const ruleRe = /\.(c\d+)\s*\{([^}]+)\}/g
    let m: RegExpExecArray | null

    while ((m = ruleRe.exec(css)) !== null) {
        const className = m[1]
        const body      = m[2]
        const props: string[] = []

        for (const prop of RELEVANT_PROPS) {
            // Match property at a declaration boundary (start or after ;)
            const valM = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;,}]+)`).exec(body)
            if (!valM) continue
            const val = valM[1].trim()
            if ((SKIP_VALUES[prop] ?? []).includes(val)) continue
            props.push(`${prop}:${val}`)
        }

        if (props.length > 0) map.set(className, props.join(';'))
    }

    return map
}

// For each opening HTML tag that has a class attribute but NO inline style,
// look up the classes in the map and inject a style attribute.
function injectInlineStyles(html: string, classMap: Map<string, string>): string {
    return html.replace(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (full, tag, attrs) => {
        // Skip if already has an inline style (e.g. images with explicit dimensions)
        if (/\bstyle\s*=\s*"/.test(attrs)) return full

        const classMatch = /\bclass\s*=\s*"([^"]*)"/.exec(attrs)
        if (!classMatch) return full

        const styles: string[] = []
        for (const cls of classMatch[1].split(/\s+/).filter(Boolean)) {
            const s = classMap.get(cls)
            if (s) styles.push(s)
        }
        if (styles.length === 0) return full

        return `<${tag}${attrs} style="${styles.join(';')}">`
    })
}

// Extract Google Docs list CSS rules (.lst-kix_* selectors) and return as a safe
// scoped <style> block. These drive the custom bullet characters (→ ◆ ● ○) via
// :before pseudo-elements, which cannot be expressed as inline styles.
function extractListCss(rawHtml: string): string {
    const styleMatch = rawHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
    if (!styleMatch) return ''

    const css = styleMatch[1]
    const rules: string[] = []

    // CSS rule regex — handles :before pseudo-selectors and multi-word selectors
    const ruleRe = /([^{};]+)\{([^}]*)\}/g
    let m: RegExpExecArray | null

    while ((m = ruleRe.exec(css)) !== null) {
        const selector   = m[1].trim()
        const body       = m[2].trim()

        // Only process list-related selectors
        if (!selector.includes('lst-kix_')) continue

        const safe: string[] = []

        for (const rawDecl of body.split(';')) {
            const decl = rawDecl.trim()
            if (!decl) continue
            const ci = decl.indexOf(':')
            if (ci === -1) continue
            const prop  = decl.slice(0, ci).trim().toLowerCase()
            const value = decl.slice(ci + 1).trim()

            if (prop === 'list-style-type' && /^[a-zA-Z0-9\s\-]+$/.test(value)) {
                safe.push(`${prop}:${value}`)
            } else if (prop === 'content') {
                // Block anything that could escape the style tag or inject scripts
                if (!/(< *\/ *style|javascript\s*:|expression\s*\(|url\s*\()/i.test(value)) {
                    safe.push(`${prop}:${value}`)
                }
            } else if (
                (prop === 'margin-left' || prop === 'padding-left' ||
                 prop === 'margin-right' || prop === 'padding-right' ||
                 prop === 'width' || prop === 'min-width') &&
                /^-?\d+(\.\d+)?(px|pt|em|rem)$/.test(value)
            ) {
                safe.push(`${prop}:${value}`)
            }
        }

        if (!safe.length) continue

        // Scope selector to the viewer container so it doesn't bleed into the rest of the UI
        const scoped = selector.split(',')
            .map(s => `.training-doc-body ${s.trim()}`)
            .join(',')

        rules.push(`${scoped}{${safe.join(';')}}`)
    }

    return rules.length ? `<style>${rules.join('')}</style>` : ''
}

// Filter class attributes on ul/ol/li to only keep lst-kix_* list classes.
// Everything else (Google's obfuscated .cNN classes) is stripped to keep the DOM clean.
function sanitizeListClass(attribs: Record<string, string>): Record<string, string> {
    if (!attribs.class) return attribs
    const safe = attribs.class
        .split(/\s+/)
        .filter(c => /^lst-kix_[a-zA-Z0-9_-]+-\d+$/.test(c) || c === 'start')
        .join(' ')
    const rest = Object.fromEntries(Object.entries(attribs).filter(([k]) => k !== 'class'))
    return safe ? { ...rest, class: safe } : rest
}

// Unwrap Google redirect URLs: https://www.google.com/url?q=REAL_URL&...
function unwrapGoogleUrl(href: string): string {
    if (!href.startsWith('https://www.google.com/url')) return href
    try {
        const url  = new URL(href)
        const real = url.searchParams.get('q')
        return real ? decodeURIComponent(real) : href
    } catch {
        return href
    }
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
        'strong', 'em', 'b', 'i', 'u', 'strike', 's',
        'a', 'img', 'hr', 'br', 'span', 'div',
    ],
    allowedAttributes: {
        '*':   ['id', 'style'],
        'a':   ['href', 'name'],
        'img': ['src', 'alt'],
        'ul':  ['class'],
        'ol':  ['class'],
        'li':  ['class'],
        'td':  ['colspan', 'rowspan'],
        'th':  ['colspan', 'rowspan'],
    },
    allowedStyles: {
        '*': {
            'text-align':      [/^(left|center|right|justify)$/],
            'font-weight':     [/^(bold|[1-9]00)$/],
            'font-style':      [/^(italic|oblique)$/],
            'text-decoration': [/^(underline|line-through)$/],
            'margin-left':     [/^-?\d+(\.\d+)?(px|pt|em|rem)$/],
        },
        'img': {
            'width':  [/^\d+(\.\d+)?(px|%)$/],
            'height': [/^\d+(\.\d+)?(px|%)$/],
        },
    },
    transformTags: {
        'a': (tagName, attribs) => ({
            tagName,
            attribs: { ...attribs, href: unwrapGoogleUrl(attribs.href ?? '') },
        }),
        'hr': () => ({ tagName: 'hr', attribs: {} }),
        'ul': (tagName, attribs) => ({ tagName, attribs: sanitizeListClass(attribs) }),
        'ol': (tagName, attribs) => ({ tagName, attribs: sanitizeListClass(attribs) }),
        'li': (tagName, attribs) => ({ tagName, attribs: sanitizeListClass(attribs) }),
    },
}

export function sanitizeDocHtml(html: string): string {
    return sanitizeHtml(html, SANITIZE_OPTIONS)
}

export async function parseGoogleDocsZip(buffer: Buffer, docId: string): Promise<ParsedDoc> {
    ensureUploadDir()

    let rawHtml = ''
    const imageMap = new Map<string, string>()   // original name → stored filename

    const zip = await unzipper.Open.buffer(buffer)
    for (const file of zip.files) {
        if (file.path.endsWith('.html')) {
            rawHtml = (await file.buffer()).toString('utf-8')
        } else if (file.path.startsWith('images/')) {
            const originalName = path.basename(file.path)
            const ext          = path.extname(originalName).toLowerCase()
            if (!ALLOWED_IMAGE_EXTS.has(ext)) continue
            const storedName   = `${docId}-${new ObjectId().toString()}${ext}`
            fs.writeFileSync(path.join(UPLOAD_DIR, storedName), await file.buffer())
            imageMap.set(originalName, storedName)
        }
    }

    if (!rawHtml) throw new Error('No HTML file found in zip')

    // Extract class→style map and list CSS BEFORE discarding the <head>
    const classMap = parseClassStyles(rawHtml)
    const listCss  = extractListCss(rawHtml)

    // Extract body content only
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    const bodyHtml  = bodyMatch ? bodyMatch[1] : rawHtml

    // Rewrite image src paths before sanitizing
    const withImages = bodyHtml.replace(/src="images\/([^"]+)"/g, (_, name) => {
        const stored = imageMap.get(name)
        return `src="/api/training-docs/images/${stored ?? name}"`
    })

    // Inject inline styles derived from CSS classes
    const withStyles = injectInlineStyles(withImages, classMap)

    // Sanitize: strip obfuscated class names, keep semantic structure + injected styles
    const clean = sanitizeHtml(withStyles, SANITIZE_OPTIONS)

    // Strip empty paragraphs (Google Docs uses them as page spacers)
    const stripped = clean
        .replace(/<p[^>]*>\s*(<span[^>]*>\s*<\/span>\s*)*<\/p>/g, '')
        .replace(/<p[^>]*>(\s|&nbsp;)+<\/p>/g, '')

    // Prepend the list CSS block so :before bullet characters render correctly
    return {
        htmlContent: listCss + stripped,
        imageFiles:  [...imageMap.values()],
    }
}

export function deleteDocImages(imageFiles: string[]) {
    for (const filename of imageFiles) {
        const p = path.join(UPLOAD_DIR, filename)
        if (fs.existsSync(p)) fs.rmSync(p, { force: true })
    }
}

export function getImagePath(filename: string): string {
    return path.join(UPLOAD_DIR, filename)
}
