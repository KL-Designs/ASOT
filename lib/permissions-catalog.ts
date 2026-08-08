import PERMISSIONS from './permissions'

// Recursively flattens the nested PERMISSIONS object into dot-path keys,
// e.g. PERMISSIONS.attendance.confirm -> "attendance.confirm".
// This flattened key space is what OrbatRole.permissions and the Roles
// Manager's permission picker draw from — one flat catalog reused from the
// already-namespaced PERMISSIONS structure rather than a parallel taxonomy.
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (Array.isArray(value)) {
            out[path] = value as string[]
        } else if (value && typeof value === 'object') {
            Object.assign(out, flatten(value as Record<string, unknown>, path))
        }
    }
    return out
}

export const PERMISSION_CATALOG: Record<string, string[]> = flatten(PERMISSIONS as unknown as Record<string, unknown>)

export const PERMISSION_KEYS: string[] = Object.keys(PERMISSION_CATALOG).sort()
