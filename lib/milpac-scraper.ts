export interface ScrapedMilpac {
	enlistedDate?: string
	promotions: { rank: string; role: string; date: string }[]
	awards: { name: string; date: string; citation?: string; clasps?: number }[]
	operations: { name: string; from: string; to?: string }[]
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&mdash;/g, '—')
		.replace(/&ndash;/g, '–')
		.replace(/\s+/g, ' ')
		.trim()
}

const MONTH = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'
const DATE_RE = `\\d{1,2}\\s+(?:${MONTH})\\s+\\d{2,4}`

function normaliseDate(raw: string): string {
	// Normalise "Sep 25" short years → "Sep 2025", and trim
	return raw.trim().replace(/\b(\d{2})\s*$/, (_, y) => `20${y}`)
}

export async function scrapeMilpac(slug: string): Promise<ScrapedMilpac> {
	const res = await fetch(`https://www.australianspecialoperationstaskforce.com/${slug}`, {
		headers: { 'User-Agent': 'Mozilla/5.0' },
		next: { revalidate: 0 },
	})
	if (!res.ok) throw new Error(`Failed to fetch page for "${slug}": ${res.status}`)

	const text = stripHtml(await res.text())

	// ── Join / Enlist date ────────────────────────────────────────────────
	const joinMatch = text.match(/Join\s+Date[:\s]+(\d{1,2}\s+(?:${MONTH})\s+\d{4})/i
		.source.replace('${MONTH}', MONTH))
	const enlistedDate = joinMatch ? normaliseDate(joinMatch[1]) : undefined

	// ── Operations ────────────────────────────────────────────────────────
	// Pattern: "13 Sep 2020 - 12 Oct 2020 Operation Promulgate"  (colon optional, dash variants)
	const opRe = new RegExp(
		`(${DATE_RE})\\s*[-–—]+\\s*(${DATE_RE})\\s*:?\\s*(Operation\\s+[A-Za-z][A-Za-z0-9 ]+?)(?=\\s*\\d|\\s*Operation|$)`,
		'gi'
	)
	const operations: ScrapedMilpac['operations'] = []
	for (const m of text.matchAll(opRe)) {
		operations.push({
			from: normaliseDate(m[1]),
			to: normaliseDate(m[2]),
			name: m[3].trim(),
		})
	}

	// ── Promotions ────────────────────────────────────────────────────────
	// Look for known rank strings preceded by a date
	const RANKS = [
		'Lieutenant General', 'Major General', 'Brigadier General', 'Brigadier',
		'Colonel', 'Lieutenant Colonel', 'Major', 'Captain',
		'First Lieutenant', 'Second Lieutenant', 'Lieutenant',
		'Warrant Officer Class 1', 'Warrant Officer Class 2', 'Warrant Officer',
		'Staff Sergeant', 'Sergeant', 'Corporal', 'Lance Corporal',
		'Private', 'Recruit', 'Rifleman',
	]
	const rankPattern = RANKS.map(r => r.replace(/\s+/g, '\\s+')).join('|')
	const promotionRe = new RegExp(
		`(${DATE_RE})\\s+(${rankPattern})\\s+([A-Z][A-Za-z ]{2,40?})(?=\\s*\\d{1,2}\\s+(?:${MONTH})|\\s*$|\\s*[A-Z]{2,})`,
		'g'
	)
	const promotions: ScrapedMilpac['promotions'] = []
	for (const m of text.matchAll(promotionRe)) {
		promotions.push({
			date: normaliseDate(m[1]),
			rank: m[2].replace(/\s+/g, ' ').trim(),
			role: m[3].trim(),
		})
	}

	// ── Awards ────────────────────────────────────────────────────────────
	const AWARD_TYPES = 'Non-Operational Award|Operational Service Citation|Service Citation'
	const awardRe = new RegExp(
		`(?:(${DATE_RE})\\s+)?([A-Z][A-Za-z0-9, ]+?)\\s+(${AWARD_TYPES})`,
		'gi'
	)
	const awards: ScrapedMilpac['awards'] = []
	for (const m of text.matchAll(awardRe)) {
		const name = m[2].trim()
		// Extract clasp number from name if present (e.g. "Second Clasp" → 2)
		const claspWords: Record<string, number> = {
			first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
			'tier 2 first': 1, 'tier 2 second': 2, 'tier 2 third': 3,
		}
		const claspMatch = name.toLowerCase().match(/((?:tier 2 )?(?:first|second|third|fourth|fifth))\s+clasp/)
		const clasps = claspMatch ? claspWords[claspMatch[1]] : undefined

		awards.push({
			name,
			date: m[1] ? normaliseDate(m[1]) : '',
			...(clasps !== undefined && { clasps }),
		})
	}

	return { enlistedDate, promotions, awards, operations }
}