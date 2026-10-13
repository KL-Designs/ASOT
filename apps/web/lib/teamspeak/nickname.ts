import { isRankAbbr } from '@asot/lib'

/**
 * Matching a member to the TeamSpeak client that is them.
 *
 * The site knows a member as "[CPL] Smith" (or just "Smith"); on TeamSpeak
 * they might be "[CPL] Smith", "CPL Smith", "CPL. Smith [1-1 A]", or plain
 * "Smith". Linking finds them by comparing the *name* in both, so everything
 * that is not the name has to come off both sides the same way.
 *
 * This replaces a `stripRank` that removed the first word whenever it was made
 * of letters, digits, brackets or dots — which is every ordinary first word.
 * "John Smith" became "Smith", and a member whose nickname carried no bracketed
 * rank could only be matched by accident. In practice that made the square
 * brackets a requirement for linking, which nobody had decided they should be.
 */

/**
 * The name inside a nickname, lower-cased.
 *
 * Bracketed groups come off wherever they are — "[CPL]" at the front, a
 * callsign "[1-1 A]" at the back. A leading word is removed only when it is
 * actually a rank abbreviation, with or without a trailing dot.
 */
export function nicknameCore(nickname: string): string {
    const noBrackets = nickname.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
    const words = noBrackets.split(' ')
    // Only with something left after it: a member whose whole name happens to
    // read as a rank abbreviation must not be reduced to nothing.
    if (words.length > 1 && isRankAbbr(words[0].replace(/\.$/, '').toUpperCase())) words.shift()
    return words.join(' ').toLowerCase()
}

/**
 * Whether a TeamSpeak nickname is this member.
 *
 * Equal names match. So does one containing the other — "Smith" on the site
 * and "Smith | Away" on TeamSpeak — but only when the shorter is at least three
 * characters: every string contains the empty string, and without the floor a
 * nickname that reduced to nothing matched whoever was first in the list.
 */
export function nicknamesMatch(expected: string, tsNickname: string): boolean {
    const a = nicknameCore(expected)
    const b = nicknameCore(tsNickname)
    if (!a || !b) return false
    if (a === b) return true
    const [short, long] = a.length <= b.length ? [a, b] : [b, a]
    return short.length >= 3 && long.includes(short)
}
