/** Escapes user input for use inside a Mongo `$regex`, so text like "c++" or "(" doesn't throw. */
export function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
