/**
 * The Training Hub's category headings, in the order the Hub shows them.
 * One list, shared by the Hub and by the Training Calendar's course picker
 * (row 213), so the two can never group courses differently.
 */
export const CATEGORY_ORDER = ['Selection', 'Reinforcement Cycle', 'BCT', 'Medical', 'CQB', 'Fires', 'Aviation', 'Communications', 'Leadership', 'Special', 'Armoured', 'Proficiency']

/**
 * Group items by category in Hub order; categories the list does not know
 * follow alphabetically, so a new category still shows up.
 */
export function groupByCategory<T extends { category: string }>(items: T[]): { category: string; items: T[] }[] {
    const known = CATEGORY_ORDER.filter(c => items.some(t => t.category === c))
    const extra = [...new Set(items.map(t => t.category))].filter(c => !CATEGORY_ORDER.includes(c)).sort()
    return [...known, ...extra].map(category => ({ category, items: items.filter(t => t.category === category) }))
}
