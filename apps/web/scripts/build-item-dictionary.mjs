/**
 * Builds lib/loadout/generated/arma-items.json from the committed itemdump.txt.
 *
 * Shape: { className: [displayName, root, ItemInfoType, sourceMod] } — every
 * signal that is NOT derivable from the classname, and nothing that is. The
 * inheritance chain is deliberately dropped: it is only needed to rebuild the
 * classifier, and itemdump.txt is where to go for that.
 *
 * Run: node scripts/build-item-dictionary.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', 'lib', 'loadout', 'generated', 'itemdump.txt')
const dest = join(here, '..', 'lib', 'loadout', 'generated', 'arma-items.json')

const out = {}
let skipped = 0

for (const line of readFileSync(src, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('ITEMDUMP|')) continue
    const parts = line.split('|')
    if (parts.length < 9) { skipped++; continue }
    const [, cls, root, type, , , mod, , ...rest] = parts
    // displayName is last so a stray pipe inside a name is harmless.
    out[cls] = [rest.join('|'), root, Number(type) || 0, mod]
}

writeFileSync(dest, JSON.stringify(out))
console.log(`wrote ${Object.keys(out).length} entries (${skipped} malformed lines skipped)`)
