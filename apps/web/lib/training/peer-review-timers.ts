export function calcTimers(candidateCount: number): { rankingMs: number; feedbackMs: number } {
    const extraGroups = Math.max(0, Math.ceil((candidateCount - 10) / 5))
    const rankingMin  = 5 + (extraGroups * 2.5)
    const feedbackMin = 15 + (extraGroups * 7.5)
    return { rankingMs: rankingMin * 60000, feedbackMs: feedbackMin * 60000 }
}

export function fmtDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
}
