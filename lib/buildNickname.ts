// Builds the standard Discord nickname: RANK NAME [DEPT]... [✞]
// Departments are sorted and uppercased; chaplain cross appended last.
export function buildNickname(
    rank: string | null | undefined,
    name: string,
    departments: string[] = [],
    isChaplain?: boolean,
): string {
    const parts: string[] = []
    if (rank) parts.push(rank)
    parts.push(name)
    for (const dept of [...departments].sort()) {
        parts.push(`[${dept.toUpperCase()}]`)
    }
    if (isChaplain) parts.push('[✞]')
    return parts.join(' ')
}
