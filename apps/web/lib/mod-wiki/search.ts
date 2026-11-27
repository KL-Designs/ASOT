/**
 * Searching and filtering the mod wiki. Pure: the page runs it in the browser
 * over the articles `GET /api/mod-wiki` sent.
 */

/** An article as the client sees it (and as search works on it). */
export interface ModWikiArticleView {
    slug: string
    title: string
    category: ModWikiCategory
    summary: string
    body: string
    pbos: string[]
    requiredMods: string[]
    version?: string
    keywords: string[]
    order?: number
    hidden?: boolean
    version_num: number
    /** True when the article is still the built-in copy from `lib/mod-wiki/articles.ts`. */
    builtIn: boolean
    updatedAt?: string
    updatedByName?: string
}

export const MOD_WIKI_CATEGORIES: { key: ModWikiCategory; label: string; blurb: string }[] = [
    { key: 'cbrn',               label: 'CBRN',                   blurb: 'Chemical, Biological, Radiological, and Nuclear systems' },
    { key: 'airborne',           label: 'Advanced Airborne',      blurb: 'Freefall, AAD, canopy control and malfunctions' },
    { key: 'systems',            label: 'ASOT Systems',           blurb: 'GPS minimap, Arsenal, diary cards, medical HUD and music' },
    { key: 'mrh-tools',         label: 'MRH Tools',              blurb: 'Soldier tablet, BFT/SatCom, hypoxia, fibre scope and markers' },
    { key: 'echo',               label: 'Echo Systems',           blurb: 'Fortification, demolitions, VIV cargo and vehicle recolouring' },
    { key: 'weapons',            label: 'Weapons',                blurb: 'Rappelling, vehicle grenading and less-lethal munitions' },
    { key: 'special-equipment',  label: 'Special Equipment',      blurb: '60mm mortar, secondary GL, mine detector, APOBS and Fulton' },
    { key: 'vehicles',           label: 'Vehicles',               blurb: 'Unflipping, driver dismount sensor, civilian vessels and ATVs' },
    { key: 'training-targets',   label: 'Training Range Targets', blurb: 'Oscillating targets, gonger plates and VTAC barricades' },
    { key: 'enhancement-addons', label: 'Enhancement Addons',     blurb: 'Sling loading, brush clearing, quick triage and zombie module' },
    { key: 'gear',               label: 'Gear',                   blurb: 'Uniforms, berets, TFAR backpacks, helmets and insignia' },
    { key: 'misc',               label: 'Miscellaneous',          blurb: 'AI ignore, swim speed, chemlight variants and aux lights' },
    { key: 'tsp',                label: 'TSP Operator Reference', blurb: 'Breach charges, melee tools and shotgun breaching' },
    { key: 'medical-simulator',  label: 'Medical Simulator',      blurb: 'AFCM simulator — 17-section training system' },
    { key: 'hebontes',           label: 'Hebontes Range',         blurb: 'Shooting range, pop-up targets and range tower' },
    { key: 'mission-template',   label: 'Mission Template',       blurb: 'Custom scripted systems in the ASOT mission template' },
]

export const MOD_WIKI_CATEGORY_KEYS = MOD_WIKI_CATEGORIES.map(c => c.key)

function byOrder(a: ModWikiArticleView, b: ModWikiArticleView) {
    return (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title)
}

export function articlesInCategory(articles: ModWikiArticleView[], category: ModWikiCategory): ModWikiArticleView[] {
    return articles.filter(a => a.category === category).sort(byOrder)
}

const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'get', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'so', 'the', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your', 'there', 'this', 'that', 'want', 'would', 'should', 'need', 'about', 'into', 'some', 'any', 'have', 'has', 'was', 'were', 'will', 'im'])

function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/['']/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t))
}

function stem(word: string): string {
    let t = word
    if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3)
    else if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y'
    else if (t.length > 4 && /(ch|sh|x|ss)es$/.test(t)) t = t.slice(0, -2)
    else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
    else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2)
    if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1)
    return t
}

export interface ModWikiSearchHit {
    article: ModWikiArticleView
    score: number
    snippet?: string
}

function countIn(words: string[], term: string): number {
    let n = 0
    for (const w of words) if (w === term || (term.length >= 3 && w.startsWith(term))) n++
    return n
}

function makeSnippet(text: string, terms: string[]): string | undefined {
    const lower = text.toLowerCase()
    let at = -1
    for (const t of terms) {
        const i = lower.search(new RegExp(`\\b${t.replace(/[^a-z0-9]/g, '')}`))
        if (i >= 0 && (at < 0 || i < at)) at = i
    }
    if (at < 0) return undefined
    const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 60)) + 1)
    const end = Math.min(text.length, at + 140)
    return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

function markdownToText(src: string): string {
    return src
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .replace(/<[^>]+>/g, '')
        .trim()
}

export function searchModWikiArticles(articles: ModWikiArticleView[], query: string, limit = 20): ModWikiSearchHit[] {
    const terms = [...new Set(tokenize(query).map(stem))]
    if (!terms.length) return []
    const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length / 2)
    const phrase = query.trim().toLowerCase().replace(/[?!.]+$/, '')
    const phraseRe = phrase.length > 3 ? new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null

    const hits: ModWikiSearchHit[] = []
    for (const article of articles) {
        const bodyText = markdownToText(article.body)
        const title = tokenize(article.title).map(stem)
        const keywords = [...article.keywords, ...article.pbos].flatMap(k => tokenize(k)).map(stem)
        const summary = tokenize(article.summary).map(stem)
        const body = tokenize(bodyText).map(stem)

        let score = 0
        let matched = 0
        let bodyOnly = true
        for (const t of terms) {
            const inTitle = countIn(title, t)
            const inKeywords = countIn(keywords, t)
            const inSummary = countIn(summary, t)
            const inBody = countIn(body, t)
            if (inTitle + inKeywords + inSummary + inBody === 0) continue
            matched++
            if (inTitle + inKeywords + inSummary) bodyOnly = false
            score += inTitle * 8 + inKeywords * 5 + inSummary * 3 + Math.min(inBody, 5)
        }
        if (matched < need) continue
        if (phraseRe?.test(article.title)) score += 15
        else if (phraseRe?.test(bodyText)) score += 6
        score += matched * 4

        hits.push({ article, score, snippet: bodyOnly ? makeSnippet(bodyText, terms) : undefined })
    }
    return hits.sort((a, b) => b.score - a.score || byOrder(a.article, b.article)).slice(0, limit)
}
