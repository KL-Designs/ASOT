import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
        }
    }
    return dp[m][n]
}

// GET /api/applications/check-name?name=xxx
// Public — returns { available: boolean, similar: string[] }
export async function GET(request: NextRequest) {
    const name = request.nextUrl.searchParams.get('name')?.trim()
    if (!name || name.length < 2) return NextResponse.json({ available: true, similar: [] })

    const lower = name.toLowerCase()

    const allUsers = await Db.users
        .find({ name: { $exists: true, $ne: null } }, { projection: { name: 1 } })
        .toArray()

    let taken = false
    const similar: string[] = []

    for (const u of allUsers) {
        if (!u.name) continue
        const existing = u.name.toLowerCase()

        if (existing === lower) {
            taken = true
            continue
        }

        // Similar: Levenshtein ≤ 2 (both names at least 3 chars to avoid noise)
        const minLen = Math.min(lower.length, existing.length)
        if (minLen >= 3 && levenshtein(lower, existing) <= 2) {
            similar.push(u.name)
        }
    }

    return NextResponse.json({ available: !taken, similar })
}
