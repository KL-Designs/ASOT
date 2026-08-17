# Milpac Assigned Loadout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub `Assigned Loadout` panel on `/milpacs/[username]` with an Arma-arsenal-style view of kit a member imports themselves from ACE arsenal.

**Architecture:** A member pastes an ACE arsenal export (valid JSON — verified) into their own milpac. Only the raw string is stored, in a new `Db.loadouts` collection; it is parsed at render. Classnames become readable names via a 31,583-entry dictionary generated from an in-game config dump, and icons via pure rule-based classification. All name resolution happens server-side.

**Tech Stack:** Next.js 15 App Router (server components), MongoDB via `Db` singleton, vitest for unit tests, CSS modules (`profile.module.css`), inline SVG icons.

**Spec:** `apps/web/docs/superpowers/specs/2026-08-17-milpac-loadout-design.md`

## Global Constraints

- All paths relative to `apps/web/` unless stated. Path alias `@/` maps to `apps/web/`.
- Unit tests live beside their subject as `*.test.ts` under `lib/`; `vitest.config.ts` only collects `lib/**/*.test.ts`. Run with `npx vitest run <path>`.
- **Do not run the Playwright E2E suite.** Repo rule: ask the user first.
- `raw` is capped at **65536 bytes**; a member may hold at most **12** loadouts; loadout `name` max **40** characters.
- Import copy must state plainly that importing publishes the kit (spec §9).
- Every task that adds or changes a `lib/`, route or component file updates the matching `docs/map/*.md` entry in the same commit (repo rule).
- Indentation: `page.tsx` uses **tabs**; `lib/`, `hero.tsx` and new files use **4 spaces**. Match the file you are editing.
- Commit style: `type(milpac): imperative subject`, prose body explaining why. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: The loadout parser

Pure function, no I/O. Everything else depends on its output shape.

**Files:**
- Create: `lib/loadout/parse.ts`
- Test: `lib/loadout/parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseLoadout(raw: string): ParsedLoadout`, `LoadoutParseError`, and the types `ParsedLoadout`, `WeaponSlot`, `Stack`, `Container`, `AssignedItems`.

- [ ] **Step 1: Write the failing test**

Create `lib/loadout/parse.test.ts`:

```ts
/**
 * The export is ARMA's getUnitLoadout wrapped by ACE. It is positional: slot 6
 * is headgear because it is sixth, not because anything in the data says so.
 * These tests pin the positions and the two container-stack forms, which are
 * the only places a silent misread is possible.
 */
import { describe, test, expect } from 'vitest'
import { parseLoadout, LoadoutParseError } from './parse'

/** A trimmed but structurally complete export: every slot populated. */
const SAMPLE = JSON.stringify([
    [
        ['CUP_arifle_M4A3_black', '', 'CUP_acc_ANPEQ_15_Flashlight_Black_L', 'CUP_optic_Elcan_SpecterDR_KF_RMR_black', ['CUP_30Rnd_556x45_X95_Tracer_Green', 30], [], 'CUP_bipod_VLTOR_Modpod_black'],
        [],
        ['BT01_F', '', '', '', ['Taser_mag', 2], [], ''],
        ['ASOT_adfrc_uniform_amcu', [['ACE_EarPlugs', 1], ['ACE_tourniquet', 8]]],
        ['ASOT_adfrc_Peacekeeper_Mk5_AMCU', [['Taser_mag', 4, 2], ['ACE_painkillers', 1, 10]]],
        ['ASOT_adfrc_patrol_bullock_amcu_medic', [['ACE_packingBandage', 50]]],
        'ASOT_adfrc_opscore_marine_Snakeskin_amcu_amp_5_Aus',
        'CUP_G_Scarf_Face_Tan',
        ['Rangefinder', '', '', '', [], [], ''],
        ['ItemMap', 'ItemGPS', 'TFAR_rf7800str', 'ItemCompass', 'TFAR_microdagr', 'CUP_NVG_GPNVG_black'],
    ],
    [['ace_arsenal_insignia', 'CUP_insignia_ua_krakenlowvis'], ['ace_earplugs', true]],
])

describe('parseLoadout', () => {
    test('reads the primary weapon and all four attachment slots', () => {
        const { primary } = parseLoadout(SAMPLE)
        expect(primary).toEqual({
            className: 'CUP_arifle_M4A3_black',
            muzzle: null,
            pointer: 'CUP_acc_ANPEQ_15_Flashlight_Black_L',
            optic: 'CUP_optic_Elcan_SpecterDR_KF_RMR_black',
            bipod: 'CUP_bipod_VLTOR_Modpod_black',
            magazine: { className: 'CUP_30Rnd_556x45_X95_Tracer_Green', ammo: 30 },
            magazine2: null,
        })
    })

    test('an empty weapon slot is null, not an empty object', () => {
        expect(parseLoadout(SAMPLE).launcher).toBeNull()
    })

    test('distinguishes an item stack from a magazine stack', () => {
        // ["ACE_painkillers",1,10] is ONE stack of ten uses, not ten stacks.
        const { vest } = parseLoadout(SAMPLE)
        expect(vest!.contents).toEqual([
            { className: 'Taser_mag', count: 4, ammo: 2 },
            { className: 'ACE_painkillers', count: 1, ammo: 10 },
        ])
        const { uniform } = parseLoadout(SAMPLE)
        expect(uniform!.contents[0]).toEqual({ className: 'ACE_EarPlugs', count: 1, ammo: null })
    })

    test('maps the positional slots to names', () => {
        const l = parseLoadout(SAMPLE)
        expect(l.headgear).toBe('ASOT_adfrc_opscore_marine_Snakeskin_amcu_amp_5_Aus')
        expect(l.facewear).toBe('CUP_G_Scarf_Face_Tan')
        expect(l.binocular!.className).toBe('Rangefinder')
        expect(l.assigned).toEqual({
            map: 'ItemMap', gps: 'ItemGPS', radio: 'TFAR_rf7800str',
            compass: 'ItemCompass', watch: 'TFAR_microdagr', nvg: 'CUP_NVG_GPNVG_black',
        })
    })

    test('accepts a bare 10-element loadout with no ACE extras wrapper', () => {
        const bare = JSON.stringify(JSON.parse(SAMPLE)[0])
        expect(parseLoadout(bare).primary!.className).toBe('CUP_arifle_M4A3_black')
    })

    test('empty strings become null rather than empty slots', () => {
        const l = parseLoadout(SAMPLE)
        expect(l.handgun!.optic).toBeNull()
        expect(l.binocular!.magazine).toBeNull()
    })

    test('rejects non-JSON with a message a member can act on', () => {
        expect(() => parseLoadout('not an export')).toThrow(LoadoutParseError)
        expect(() => parseLoadout('not an export')).toThrow(/ACE arsenal export/)
    })

    test('rejects a JSON array of the wrong shape, naming the problem', () => {
        expect(() => parseLoadout('[1,2,3]')).toThrow(/10 a loadout has/)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/loadout/parse.test.ts`
Expected: FAIL — `Cannot find module './parse'`.

- [ ] **Step 3: Write the implementation**

Create `lib/loadout/parse.ts`:

```ts
/**
 * Parses an ACE arsenal export into a shape the panel can render.
 *
 * The export is ARMA's `getUnitLoadout` array, which is *positional* — slot 6
 * is headgear because it is sixth. It is also valid JSON, verified against a
 * real ASOT export, so no SQF parser is needed.
 *
 * Nothing here is stored. The raw string is the record; this runs at render, so
 * improving the parser improves every existing loadout with no migration.
 */

export class LoadoutParseError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'LoadoutParseError'
    }
}

export type WeaponSlot = {
    className: string
    muzzle: string | null
    pointer: string | null
    optic: string | null
    bipod: string | null
    magazine: { className: string; ammo: number } | null
    magazine2: { className: string; ammo: number } | null
}

/** `count` is how many; `ammo` is rounds/uses each, null for non-magazines. */
export type Stack = { className: string; count: number; ammo: number | null }

export type Container = { className: string; contents: Stack[] } | null

export type AssignedItems = {
    map: string | null
    gps: string | null
    radio: string | null
    compass: string | null
    watch: string | null
    nvg: string | null
}

export type ParsedLoadout = {
    primary: WeaponSlot | null
    launcher: WeaponSlot | null
    handgun: WeaponSlot | null
    uniform: Container
    vest: Container
    backpack: Container
    headgear: string | null
    facewear: string | null
    binocular: WeaponSlot | null
    assigned: AssignedItems
}

/** Arma writes "no item" as an empty string, which is not the same as absent. */
function orNull(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null
}

function weapon(v: unknown): WeaponSlot | null {
    if (!Array.isArray(v) || v.length === 0) return null
    const className = orNull(v[0])
    if (!className) return null

    const mag = (m: unknown) =>
        Array.isArray(m) && m.length >= 2 && typeof m[0] === 'string'
            ? { className: m[0] as string, ammo: Number(m[1]) || 0 }
            : null

    return {
        className,
        muzzle: orNull(v[1]),
        pointer: orNull(v[2]),
        optic: orNull(v[3]),
        bipod: orNull(v[6]),
        magazine: mag(v[4]),
        magazine2: mag(v[5]),
    }
}

function container(v: unknown): Container {
    if (!Array.isArray(v) || v.length === 0) return null
    const className = orNull(v[0])
    if (!className) return null

    const raw = Array.isArray(v[1]) ? (v[1] as unknown[]) : []
    const contents: Stack[] = []
    for (const entry of raw) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
        contents.push({
            className: entry[0],
            count: Number(entry[1]) || 0,
            // Three elements means a magazine: the third is rounds per stack.
            ammo: entry.length >= 3 ? Number(entry[2]) || 0 : null,
        })
    }
    return { className, contents }
}

export function parseLoadout(raw: string): ParsedLoadout {
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        throw new LoadoutParseError('That does not look like an ACE arsenal export — it is not valid data.')
    }

    if (!Array.isArray(data)) {
        throw new LoadoutParseError('That does not look like an ACE arsenal export — expected a list.')
    }

    // ACE wraps the loadout with an extras block; some paths produce the bare
    // loadout. Tell them apart by shape rather than by length alone.
    const slots: unknown[] =
        data.length === 2 && Array.isArray(data[0]) && (data[0] as unknown[]).length === 10
            ? (data[0] as unknown[])
            : data

    if (slots.length !== 10) {
        throw new LoadoutParseError(
            `That export has ${slots.length} slots, not the 10 a loadout has — it may have been truncated when copied.`,
        )
    }

    const assignedRaw = Array.isArray(slots[9]) ? (slots[9] as unknown[]) : []

    return {
        primary: weapon(slots[0]),
        launcher: weapon(slots[1]),
        handgun: weapon(slots[2]),
        uniform: container(slots[3]),
        vest: container(slots[4]),
        backpack: container(slots[5]),
        headgear: orNull(slots[6]),
        facewear: orNull(slots[7]),
        binocular: weapon(slots[8]),
        assigned: {
            map: orNull(assignedRaw[0]),
            gps: orNull(assignedRaw[1]),
            radio: orNull(assignedRaw[2]),
            compass: orNull(assignedRaw[3]),
            watch: orNull(assignedRaw[4]),
            nvg: orNull(assignedRaw[5]),
        },
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/loadout/parse.test.ts`
Expected: PASS, 8 tests.

**Deliberate deviation from spec §5.** The spec called for asserting each slot's
type and naming the slot that failed. This parser instead validates the slot
*count* and degrades a malformed individual slot to `null`. Rejecting a whole
export because one slot is shaped oddly is worse for the member than rendering
that slot empty, and the count check already catches the realistic failure —
a truncated paste. If per-slot rejection is wanted later, it belongs here, not
spread across callers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loadout/parse.ts apps/web/lib/loadout/parse.test.ts
git commit -m "feat(milpac): parse ACE arsenal loadout exports"
```

---

### Task 2: The item-name dictionary

Turns 31,583 config rows into readable names, with a fallback so a missing dictionary degrades rather than breaks.

**Files:**
- Create: `lib/loadout/dump-items.sqf` (the in-game script, committed so it can be re-run)
- Create: `lib/loadout/generated/itemdump.txt` (extracted from the `.rpt`, the regeneration source)
- Create: `lib/loadout/generated/arma-items.json` (built artefact, committed)
- Create: `scripts/build-item-dictionary.mjs`
- Create: `lib/loadout/names.ts`
- Test: `lib/loadout/names.test.ts`
- Modify: `docs/map/h-lib-types-components.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveItemName(className: string): string`, `prettifyClassName(className: string): string`, `itemMeta(className: string): ItemMeta | null` where `ItemMeta = { name: string; root: string; type: number; mod: string }`.

- [ ] **Step 1: Commit the dump script and extract its source data**

Create `lib/loadout/dump-items.sqf` with exactly this content. It is committed so
the next person to regenerate the dictionary does not have to reconstruct it:

```sqf
// Dumps every equippable item's displayName and classification signals.
// Run in the debug console with the unit's full modlist loaded, then extract
// the ITEMDUMP block from %LOCALAPPDATA%\Arma 3\*.rpt.
private _rows = [];

private _add = {
    params ["_cfg", "_root"];
    private _cls  = configName _cfg;
    private _name = getText (_cfg >> "displayName");
    if (_name isEqualTo "") exitWith {};

    // ACE arsenal shows scopeArsenal where it is defined, which is not always scope.
    private _scope  = getNumber (_cfg >> "scope");
    private _scopeA = if (isNumber (_cfg >> "scopeArsenal")) then { getNumber (_cfg >> "scopeArsenal") } else { _scope };
    if (_scope < 2 && { _scopeA < 2 }) exitWith {};

    // The inheritance chain separates a rifle from a launcher without guessing
    // at classname spelling. Capped at 6 to keep lines short.
    private _chain = [];
    private _p = inheritsFrom _cfg;
    while { !isNull _p && { count _chain < 6 } } do {
        _chain pushBack (configName _p);
        _p = inheritsFrom _p;
    };

    private _type = getNumber (_cfg >> "ItemInfo" >> "type");
    private _mass = getNumber (_cfg >> "ItemInfo" >> "mass");
    if (_root isEqualTo "CfgMagazines") then {
        _type = -1;
        _mass = getNumber (_cfg >> "mass");
    };

    private _mod  = "";
    private _mods = configSourceModList _cfg;
    if (count _mods > 0) then { _mod = _mods select 0 };

    // Pipe-delimited with displayName last: `str` on an array emits Arma's own
    // quoting, which is a nuisance to unescape, and a stray pipe inside a name
    // is harmless when the name is the final field.
    _rows pushBack format ["ITEMDUMP|%1|%2|%3|%4|%5|%6|%7|%8",
        _cls, _root, _type, _mass, getNumber (_cfg >> "count"), _mod, _chain joinString ">", _name];
};

{ [_x, "CfgWeapons"]   call _add } forEach ("true" configClasses (configFile >> "CfgWeapons"));
{ [_x, "CfgMagazines"] call _add } forEach ("true" configClasses (configFile >> "CfgMagazines"));
{ [_x, "CfgGlasses"]   call _add } forEach ("true" configClasses (configFile >> "CfgGlasses"));
{ [_x, "CfgVehicles"]  call _add } forEach ("configName _x isKindOf 'Bag_Base'" configClasses (configFile >> "CfgVehicles"));

diag_log "=== ITEMDUMP BEGIN ===";
{ diag_log _x } forEach _rows;
diag_log format ["=== ITEMDUMP END (%1 entries) ===", count _rows];
```

Two things in there are load-bearing and were both wrong in the first draft:
facewear lives in `CfgGlasses`, not `CfgWeapons`, and `CfgVehicles` must be
filtered to `Bag_Base` or it dumps every vehicle and prop in the modlist.

Extract the dump from the raw `.rpt` at the repo root into the committed source file:

```bash
node -e "
const fs=require('fs');
const lines=fs.readFileSync('armaitems.txt','utf8').split(/\r?\n/);
const out=[]; let on=false;
for (const l of lines) {
  if (l.includes('=== ITEMDUMP BEGIN ===')) { on=true; continue }
  if (l.includes('=== ITEMDUMP END')) break
  if (!on) continue
  const m=l.match(/\"(ITEMDUMP\|.*)\"\s*\$/);
  if (m) out.push(m[1].replace(/\"\"/g,'\"'))
}
fs.mkdirSync('apps/web/lib/loadout/generated',{recursive:true});
fs.writeFileSync('apps/web/lib/loadout/generated/itemdump.txt', out.join('\n'));
console.log('extracted', out.length, 'rows');
"
```

Expected: `extracted 31583 rows`. Leave the raw `.rpt` (`armaitems.txt`) untracked.

- [ ] **Step 2: Write the build script**

Create `scripts/build-item-dictionary.mjs`:

```js
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
```

- [ ] **Step 3: Run the build script**

Run: `node scripts/build-item-dictionary.mjs`
Expected: `wrote 31583 entries (0 malformed lines skipped)`, producing a ~2.7 MB `arma-items.json`.

- [ ] **Step 4: Write the failing test**

Create `lib/loadout/names.test.ts`:

```ts
/**
 * Names come from Arma's own configs, so the dictionary layer is not really
 * under test — the fallback is. It is what stands between a member equipping
 * something added after the dump and the panel rendering a blank row.
 */
import { describe, test, expect } from 'vitest'
import { resolveItemName, prettifyClassName, itemMeta } from './names'

describe('resolveItemName', () => {
    test('prefers the generated dictionary', () => {
        expect(resolveItemName('CUP_30Rnd_556x45_X95_Tracer_Green')).toBe('5.56mm 30Rnd X95 (Green tracer) Mag')
        expect(resolveItemName('MRH_SoldierTab')).toBe('P.D.A.')
    })

    test('falls back for a classname the dump never saw', () => {
        // A mod added after the dump must render as something, not nothing.
        expect(resolveItemName('CUP_arifle_MadeUpGun_black')).toBe('Made Up Gun Black')
    })

    test('an unresolvable classname still returns non-empty text', () => {
        expect(resolveItemName('___').length).toBeGreaterThan(0)
    })
})

describe('prettifyClassName', () => {
    test('strips vendor prefixes and type infixes', () => {
        expect(prettifyClassName('CUP_arifle_M4A3_black')).toBe('M4A3 Black')
        expect(prettifyClassName('ACE_optic_Hamr_2D')).toBe('Hamr 2D')
        expect(prettifyClassName('kat_chestSeal')).toBe('Chest Seal')
    })

    test('splits camelCase so kat_ items do not read as one word', () => {
        expect(prettifyClassName('kat_phenylephrineAuto')).toBe('Phenylephrine Auto')
    })

    test('returns the raw classname when nothing survives stripping', () => {
        expect(prettifyClassName('CUP_')).toBe('CUP_')
    })
})

describe('itemMeta', () => {
    test('exposes the config signals the classifier needs', () => {
        const meta = itemMeta('ASOT_adfrc_uniform_amcu')
        expect(meta?.type).toBe(801)
        expect(meta?.root).toBe('CfgWeapons')
    })

    test('returns null for an unknown classname', () => {
        expect(itemMeta('CUP_arifle_MadeUpGun_black')).toBeNull()
    })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run lib/loadout/names.test.ts`
Expected: FAIL — `Cannot find module './names'`.

- [ ] **Step 6: Write the implementation**

Create `lib/loadout/names.ts`:

```ts
import table from './generated/arma-items.json'

/**
 * Classname -> readable name, in three layers: the generated dictionary, hand
 * overrides, then an algorithmic fallback.
 *
 * The fallback is the floor. A member who equips something added after the dump
 * must still get a legible row, so nothing here may return an empty string.
 *
 * Server-side only. The table is ~2.7MB; the browser receives resolved strings
 * for the ~60 items in one loadout, never the table.
 */

export type ItemMeta = { name: string; root: string; type: number; mod: string }

type Row = [name: string, root: string, type: number, mod: string]
const TABLE = table as unknown as Record<string, Row>

/** Wins over the generated file, for names the unit words differently. */
const OVERRIDES: Record<string, string> = {}

const VENDOR = /^(CUP|ACE|ace|kat|KAT|TFAR|MRH|ASOT|SP|CFP|VME|JAM)_/
const TYPE_INFIX = /^(arifle|srifle|hgun|launch|optic|acc|muzzle|bipod|item|weapon|mag|bag|vest|uniform|headgear|glasses|nvg)_/i

export function itemMeta(className: string): ItemMeta | null {
    const row = TABLE[className]
    if (!row) return null
    return { name: row[0], root: row[1], type: row[2], mod: row[3] }
}

export function prettifyClassName(className: string): string {
    let s = className.replace(VENDOR, '')
    s = s.replace(TYPE_INFIX, '')
    if (s.length === 0) return className

    const words = s
        .split('_')
        .filter(Boolean)
        // camelCase only, never digit-then-capital: including digits splits
        // "M4A3" into "M4 A3". Verified against the real classnames.
        .flatMap(part => part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' '))
        .filter(Boolean)
        .map(w => (/^[A-Z0-9]+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))

    return words.length > 0 ? words.join(' ') : className
}

export function resolveItemName(className: string): string {
    return OVERRIDES[className] ?? TABLE[className]?.[0] ?? prettifyClassName(className)
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run lib/loadout/names.test.ts`
Expected: PASS, 6 tests.

If `prettifyClassName('CUP_arifle_M4A3_black')` returns `M4A3 Black` but the camelCase test fails, the `flatMap` split is the place to look — not the regexes above it.

- [ ] **Step 8: Update the site map**

In `docs/map/h-lib-types-components.md`, add after the `lib/military/milpac-slug.ts` entry:

```markdown
### lib/loadout/names.ts
- `resolveItemName(className)` — Arma classname to readable name: hand overrides, then the generated dictionary, then `prettifyClassName`. Never returns empty.
- `prettifyClassName(className)` — the fallback: strips vendor prefix and type infix, splits camelCase, title-cases. Unit-tested in `names.test.ts`.
- `itemMeta(className)` — `{name, root, type, mod}` from the dictionary, or null. The classifier's input.
- `generated/arma-items.json` — 31,583 entries, `{class: [name, root, ItemInfo.type, sourceMod]}`, ~2.7MB, **server-side only**. Rebuild with `node scripts/build-item-dictionary.mjs` from `generated/itemdump.txt`, which itself comes from running `lib/loadout/dump-items.sqf` in-game and extracting the `ITEMDUMP` block from the `.rpt`.
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/loadout/ apps/web/scripts/build-item-dictionary.mjs apps/web/docs/map/h-lib-types-components.md
git commit -m "feat(milpac): item-name dictionary from the Arma config dump"
```

---

### Task 3: The icon classifier

**Files:**
- Create: `lib/loadout/classify.ts`
- Test: `lib/loadout/classify.test.ts`

**Interfaces:**
- Consumes: `itemMeta` from Task 2.
- Produces: `iconFor(className: string, slot?: SlotContext): IconKey`, and the exported types `IconKey`, `SlotContext`. `ICON_KEYS` is the exhaustive list Task 4 must draw.

- [ ] **Step 1: Write the failing test**

Create `lib/loadout/classify.test.ts`:

```ts
/**
 * Slot context is authoritative where it exists — an entry in the optic slot is
 * an optic whatever it is called. Only container contents need real inference,
 * and that is where a new mod can silently land in the wrong bucket, so the
 * rules are pinned here rather than eyeballed on the page.
 */
import { describe, test, expect } from 'vitest'
import { iconFor, ICON_KEYS } from './classify'

describe('iconFor', () => {
    test('slot context wins over any guess at the classname', () => {
        expect(iconFor('CUP_optic_Elcan_SpecterDR_KF_RMR_black', 'optic')).toBe('optic')
        expect(iconFor('CUP_acc_ANPEQ_15_Flashlight_Black_L', 'pointer')).toBe('pointer')
        expect(iconFor('CUP_bipod_VLTOR_Modpod_black', 'bipod')).toBe('bipod')
        expect(iconFor('ItemMap', 'map')).toBe('map')
        expect(iconFor('TFAR_rf7800str', 'radio')).toBe('radio')
    })

    test('uses ItemInfo.type for gear the dictionary knows', () => {
        expect(iconFor('ASOT_adfrc_uniform_amcu')).toBe('uniform')
        expect(iconFor('ASOT_adfrc_Peacekeeper_Mk5_AMCU')).toBe('vest')
        expect(iconFor('ASOT_adfrc_patrol_bullock_amcu_medic')).toBe('backpack')
    })

    test('ItemInfo.type 302 is not treated as bipod', () => {
        // Regression: 302 nominally means bipod, but 258 of the 324 entries
        // carrying it are CBA/ACE misc items. Trusting it rendered tourniquets
        // and PDAs as bipods.
        expect(iconFor('ACE_tourniquet')).not.toBe('bipod')
        expect(iconFor('MRH_SoldierTab')).not.toBe('bipod')
    })

    test('classifies medical items out of container contents', () => {
        expect(iconFor('ACE_tourniquet')).toBe('tourniquet')
        expect(iconFor('ACE_packingBandage')).toBe('bandage')
        expect(iconFor('kat_IV_16')).toBe('iv')
        expect(iconFor('ACE_epinephrine')).toBe('syringe')
        expect(iconFor('kat_chestSeal')).toBe('chestseal')
        expect(iconFor('ACE_splint')).toBe('splint')
    })

    test('separates the throwables', () => {
        expect(iconFor('CUP_HandGrenade_M67')).toBe('grenade')
        expect(iconFor('SmokeShellPurple')).toBe('smoke')
        expect(iconFor('ACE_M84')).toBe('flashbang')
    })

    test('a magazine is a magazine even when unknown to the dictionary', () => {
        expect(iconFor('CUP_30Rnd_556x45_X95_Tracer_Green')).toBe('magazine')
    })

    test('anything unrecognised gets the generic item mark, never empty', () => {
        const key = iconFor('some_mod_thing_nobody_has_seen')
        expect(key).toBe('item')
        expect(ICON_KEYS).toContain(key)
    })

    test('every key it can return is in ICON_KEYS', () => {
        const samples = ['ACE_tourniquet', 'SmokeShell', 'ItemMap', 'ASOT_adfrc_uniform_amcu', 'zzz_unknown']
        for (const s of samples) expect(ICON_KEYS).toContain(iconFor(s))
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/loadout/classify.test.ts`
Expected: FAIL — `Cannot find module './classify'`.

- [ ] **Step 3: Write the implementation**

Create `lib/loadout/classify.ts`:

```ts
import { itemMeta } from './names'

/**
 * Which icon represents an item.
 *
 * Three tiers, most reliable first: the slot the item sits in (positional, so
 * exact), Arma's own `ItemInfo.type` code, then classname rules. Only container
 * contents reach tier three.
 *
 * Deliberately in TypeScript rather than baked into the config dump: rules will
 * be wrong on the first pass, and fixing one must not mean relaunching Arma.
 */

export const ICON_KEYS = [
    'rifle', 'carbine', 'dmr', 'sniper', 'mg', 'launcher', 'pistol', 'taser',
    'optic', 'holo', 'pointer', 'muzzle', 'bipod', 'grip',
    'magazine', 'belt', 'grenade', 'smoke', 'flashbang', 'explosive',
    'tourniquet', 'bandage', 'iv', 'syringe', 'splint', 'airway', 'chestseal',
    'surgical', 'medication', 'diagnostic',
    'radio', 'gps', 'map', 'compass', 'watch', 'nvg', 'rangefinder', 'strobe',
    'uniform', 'vest', 'backpack', 'helmet', 'facewear',
    'tool', 'document', 'item',
] as const

export type IconKey = (typeof ICON_KEYS)[number]

export type SlotContext =
    | 'primary' | 'launcher' | 'handgun'
    | 'optic' | 'pointer' | 'muzzle' | 'bipod'
    | 'uniform' | 'vest' | 'backpack' | 'headgear' | 'facewear' | 'binocular'
    | 'map' | 'gps' | 'radio' | 'compass' | 'watch' | 'nvg'
    | 'content'

/** Positional slots are exact — no inference needed or wanted. */
const BY_SLOT: Partial<Record<SlotContext, IconKey>> = {
    launcher: 'launcher', handgun: 'pistol',
    optic: 'optic', pointer: 'pointer', muzzle: 'muzzle', bipod: 'bipod',
    uniform: 'uniform', vest: 'vest', backpack: 'backpack',
    headgear: 'helmet', facewear: 'facewear', binocular: 'rangefinder',
    map: 'map', gps: 'gps', radio: 'radio', compass: 'compass',
    watch: 'watch', nvg: 'nvg',
}

/**
 * Arma's own gear-slot codes. Confirmed against the dump — 605 is headgear,
 * not glasses.
 *
 * 302 is deliberately absent. It nominally means "bipod", but 258 of the 324
 * entries carrying it are CBA/ACE misc items — `ACE_tourniquet` and
 * `MRH_SoldierTab` among them — so it is a generic bucket in practice and
 * mapping it would render tourniquets as bipods. Real bipods still resolve
 * exactly, from slot position rather than this table.
 */
const BY_TYPE: Record<number, IconKey> = {
    101: 'muzzle', 201: 'optic', 301: 'pointer',
    605: 'helmet', 616: 'nvg', 620: 'tool', 621: 'tool',
    701: 'vest', 801: 'uniform', 401: 'bandage', 619: 'surgical',
}

/** Ordered: the first match wins, so put the specific before the general. */
const BY_NAME: [RegExp, IconKey][] = [
    [/tourniquet/i, 'tourniquet'],
    [/bandage|dressing|gauze/i, 'bandage'],
    [/chestseal|occlusi/i, 'chestseal'],
    [/_IV_|salineIV|bloodIV|IO_|plasma/i, 'iv'],
    [/epinephrine|morphine|adenosine|naloxone|atropine|phenylephrine|autoinject/i, 'syringe'],
    [/splint/i, 'splint'],
    [/guedel|airway|larynx|BVM|suction|ncdKit/i, 'airway'],
    [/surgical|medikit|suture/i, 'surgical'],
    [/painkiller|penthrox|pill|carbonate|tranexamic/i, 'medication'],
    [/pulseoximeter|stethoscope|thermometer|bloodpressure/i, 'diagnostic'],
    [/smokeshell|smokegrenade|_smoke/i, 'smoke'],
    [/M84|flashbang|stun/i, 'flashbang'],
    [/grenade|_HandGrenade|_frag/i, 'grenade'],
    [/mine|satchel|demo|explosive|charge/i, 'explosive'],
    [/strobe/i, 'strobe'],
    [/microdagr|_GPS|terminal/i, 'gps'],
    [/maptools|_map/i, 'map'],
    [/rangefinder|binocular|designator/i, 'rangefinder'],
    [/entrenching|toolkit|cabletie|fiberscope|defusal/i, 'tool'],
    [/booklet|proforma|document|notepad|tab$/i, 'document'],
    [/belt|linked/i, 'belt'],
]

export function iconFor(className: string, slot: SlotContext = 'content'): IconKey {
    const bySlot = BY_SLOT[slot]
    if (bySlot) return bySlot

    const meta = itemMeta(className)

    if (slot === 'primary') {
        if (/sniper|_LRR|m107|awm/i.test(className)) return 'sniper'
        if (/mg|minimi|maximi|m249|m240|pkp/i.test(className)) return 'mg'
        if (/dmr|marksman|sr25|mk11/i.test(className)) return 'dmr'
        if (/carbine|_c8|mk18|shorty/i.test(className)) return 'carbine'
        return 'rifle'
    }

    if (meta && BY_TYPE[meta.type]) return BY_TYPE[meta.type]
    if (meta?.root === 'CfgGlasses') return 'facewear'
    if (meta?.root === 'CfgVehicles') return 'backpack'

    for (const [re, key] of BY_NAME) if (re.test(className)) return key

    // Checked after the name rules so a smoke grenade is smoke, not "magazine".
    if (meta?.root === 'CfgMagazines') return 'magazine'
    if (/taser/i.test(className)) return 'taser'

    return 'item'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/loadout/classify.test.ts`
Expected: PASS, 8 tests.

If `iconFor('CUP_30Rnd_556x45_X95_Tracer_Green')` returns `item` instead of `magazine`, the dictionary was not built — re-run Task 2 Step 3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/loadout/classify.ts apps/web/lib/loadout/classify.test.ts
git commit -m "feat(milpac): classify loadout items to icon categories"
```

---

### Task 4: The icon set

**Files:**
- Create: `components/loadout/icons.tsx`
- Modify: `docs/map/h-lib-types-components.md`

**Interfaces:**
- Consumes: `IconKey`, `ICON_KEYS` from Task 3.
- Produces: `<LoadoutIcon icon={IconKey} size?={number} />` — a 24×24 `currentColor` SVG.

- [ ] **Step 1: Write the component**

Create `components/loadout/icons.tsx`. Every key in `ICON_KEYS` must have an entry; there is no fallback branch, because a missing key should be a type error rather than an invisible gap.

```tsx
import type { IconKey } from '@/lib/loadout/classify'

/**
 * Marks for loadout items — our own, not Arma's.
 *
 * Real item artwork lives in mod PBOs as .paa textures and would mean
 * extracting and converting hundreds of files (spec §8). These generalise
 * instead: one mark per kind of thing, drawn on a 24x24 grid in currentColor so
 * a row can tint them with the member's accent.
 *
 * PATHS is a total map over IconKey, deliberately. Adding a key to ICON_KEYS
 * without drawing it is then a compile error, not a blank square in production.
 */
const PATHS: Record<IconKey, string> = {
    rifle: 'M2 10h13l2-2h5v3l-3 1v2h-4l-1 2h-3l-1-2H8v-2H2z',
    carbine: 'M3 10h11l2-2h5v3l-3 1v2h-4l-1 2h-2l-1-2H3z',
    dmr: 'M2 10h14l2-2h6v3l-3 1v2h-4l-1 2h-3l-1-2H6v-2H2z',
    sniper: 'M2 11h13l2-3h7v3l-4 1v2h-4l-1 2h-3v-2H2z',
    mg: 'M2 9h14l2-2h6v4l-3 1v3h-5l-1 2H6v-3H2z',
    launcher: 'M2 9h18a2 2 0 0 1 0 6H8l-2 3H4l1-3H2z',
    pistol: 'M4 8h12v4h-2l-1 2h-2l-3 6H5l1-6H4z',
    taser: 'M5 8h11l3 3-3 3h-3l-2 6H7l1-6H5z',
    optic: 'M4 9h16v6H4zm4-3h8v3H8zm-6 5h2v2H2zm18 0h2v2h-2z',
    holo: 'M5 8h14v8H5zm3 3h8v2H8z',
    pointer: 'M6 9h10v6H6zm10 2h6v2h-6zM4 11h2v2H4z',
    muzzle: 'M3 10h11v4H3zm11 1h8v2h-8z',
    bipod: 'M11 4h2v8h-2zM4 20l7-8 2 1-6 7zm16 0l-7-8-2 1 6 7z',
    grip: 'M9 4h6v6l-2 10h-2L9 10z',
    magazine: 'M7 4h10v5H7zm1 5h8v11H8z',
    belt: 'M3 9h18v6H3zm3 0v6m4-6v6m4-6v6m4-6v6',
    grenade: 'M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-2-3h4v3h-4z',
    smoke: 'M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-2-4h4v2h-4zM6 3q4 2 0 4',
    flashbang: 'M13 2 5 13h5l-1 9 8-11h-5z',
    explosive: 'M12 3l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z',
    tourniquet: 'M4 10h16v4H4zm5-4h2v12H9zm7 2 4 4-4 4z',
    bandage: 'M3 11h18v2H3zm4-5h10v12H7zm-2 6h14',
    iv: 'M10 2h4v6h-4zm1 6h2v8h-2zm-2 8h6v6H9z',
    syringe: 'M3 20l4-4 M6 17l-2 4 4-2M8 15l7-7 3 3-7 7zM16 4l4 4',
    splint: 'M6 3h3v18H6zm9 0h3v18h-3zM4 10h16v2H4z',
    airway: 'M6 18q0-12 8-12 4 0 4 4t-4 4h-4',
    chestseal: 'M4 5h16v14H4zm4 4h8v6H8z',
    surgical: 'M5 4h14v16H5zm4 4h6v2H9zm2-2h2v6h-2z',
    medication: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM7 12h10',
    diagnostic: 'M3 12h4l2-5 3 10 2-5h7',
    radio: 'M5 8h14v12H5zm3-6 3 6M18 4v4M8 12h4v4H8z',
    gps: 'M6 3h12v18H6zm2 3h8v8H8z',
    map: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16',
    compass: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm4 5-6 3-2 6 6-3z',
    watch: 'M9 2h6v4H9zm0 16h6v4H9zm3-12a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 2v4h3',
    nvg: 'M3 8h18v6a4 4 0 0 1-4 4h-2l-3-3-3 3H7a4 4 0 0 1-4-4zm3 2h4v3H6zm8 0h4v3h-4z',
    rangefinder: 'M3 7h18v10H3zm5 0v10m8-10v10M6 4h4v3H6zm8 0h4v3h-4z',
    strobe: 'M11 2h2v6h-2zM4 6l4 4M20 6l-4 4M8 12h8v10H8z',
    uniform: 'M9 3h6l5 3-2 4-2-1v12H8V9L6 10 4 6z',
    vest: 'M8 3h8l3 3v15H5V6zm4 0v18M5 10h14',
    backpack: 'M8 6h8a3 3 0 0 1 3 3v12H5V9a3 3 0 0 1 3-3zm1-3h6v3H9zm-1 9h8v4H8z',
    helmet: 'M3 15a9 9 0 0 1 18 0v3h-4l-2 2H9l-2-2H3z',
    facewear: 'M3 9h18v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zm0-3h18v3H3z',
    tool: 'M14 3a5 5 0 0 0-4 8l-7 7 3 3 7-7a5 5 0 0 0 6-7l-3 3-3-3 3-3a5 5 0 0 0-2-1z',
    document: 'M6 2h8l4 4v16H6zm8 0v5h5M9 12h6M9 16h6',
    item: 'M12 2l9 5v10l-9 5-9-5V7zm0 2.3L5 8v8l7 3.7L19 16V8z',
}

export function LoadoutIcon({ icon, size = 16 }: { icon: IconKey; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth={1.4}
            strokeLinejoin='round'
            aria-hidden='true'
        >
            <path d={PATHS[icon]} />
        </svg>
    )
}
```

- [ ] **Step 2: Verify it compiles and every key is drawn**

Run: `npx tsc --noEmit`
Expected: exit 0. A missing `ICON_KEYS` entry surfaces here as "Property 'x' is missing in type".

- [ ] **Step 3: Update the site map**

In `docs/map/h-lib-types-components.md`, under components, add:

```markdown
### components/loadout/icons.tsx
- `<LoadoutIcon icon size?>` — 24×24 `currentColor` SVG mark per `IconKey`. `PATHS` is a total `Record<IconKey, string>` on purpose: adding a key to `ICON_KEYS` without drawing it is a compile error rather than a blank square. Our own marks, not Arma's — real `.paa` artwork is out of scope.
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/loadout/ apps/web/docs/map/h-lib-types-components.md
git commit -m "feat(milpac): icon set for loadout items"
```

---

### Task 5: Storage and the write API

**Files:**
- Create: `types/loadout.d.ts`
- Modify: `lib/mongo.ts` (add to `DbInterface`)
- Create: `app/api/loadouts/route.ts`
- Create: `app/api/loadouts/[id]/route.ts`
- Modify: `docs/map/d-misc-api.md`, `docs/map/h-lib-types-components.md`

**Interfaces:**
- Consumes: `parseLoadout`, `LoadoutParseError` (Task 1).
- Produces: `Db.loadouts` typed as `MongoCollection<MemberLoadout>`; `MemberLoadout` global type; routes `POST /api/loadouts`, `PATCH /api/loadouts/[id]`, `DELETE /api/loadouts/[id]`.

- [ ] **Step 1: Add the type**

Create `types/loadout.d.ts`:

```ts
import type { ObjectId } from 'mongodb'

export {}

declare global {
    /**
     * A member's imported ACE arsenal loadout.
     *
     * Only `raw` is stored. Parsing happens at render, so improving the parser
     * or the name dictionary improves every existing row with no migration.
     *
     * Web-only, so it lives here rather than in the monorepo-root types/ —
     * User is shared with apps/bot and has no business carrying this.
     */
    interface MemberLoadout {
        _id: ObjectId
        /** Discord id, as every other member-scoped collection keys on. */
        userId: string
        name: string
        isDefault: boolean
        /** Opt-in: may other members copy the export string? */
        shared: boolean
        /** The ACE arsenal export, verbatim. The source of truth. */
        raw: string
        createdAt: Date
        updatedAt: Date
    }
}
```

- [ ] **Step 2: Register the collection**

In `lib/mongo.ts`, inside `DbInterface`, after the `notifications` line add:

```ts
    loadouts: db.collection('loadouts') as MongoCollection<MemberLoadout>,
```

- [ ] **Step 3: Write the create route**

Create `app/api/loadouts/route.ts`:

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { parseLoadout, LoadoutParseError } from '@/lib/loadout/parse'

/** Bounds, not preferences — see the plan's Global Constraints. */
const MAX_RAW_BYTES = 65536
const MAX_PER_MEMBER = 12
const MAX_NAME = 40

export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const raw = typeof body?.raw === 'string' ? body.raw.trim() : ''
    const name = (typeof body?.name === 'string' ? body.name : '').trim().slice(0, MAX_NAME) || 'Standard'

    if (!raw) return NextResponse.json({ error: 'Paste your ACE arsenal export first.' }, { status: 400 })
    if (Buffer.byteLength(raw) > MAX_RAW_BYTES) {
        return NextResponse.json({ error: 'That export is too large to be a loadout.' }, { status: 400 })
    }

    // Parse to validate only — the parsed form is never stored.
    try {
        parseLoadout(raw)
    } catch (err) {
        const message = err instanceof LoadoutParseError ? err.message : 'That export could not be read.'
        return NextResponse.json({ error: message }, { status: 400 })
    }

    const existing = await Db.loadouts.countDocuments({ userId: me.id })
    if (existing >= MAX_PER_MEMBER) {
        return NextResponse.json(
            { error: `You already have ${MAX_PER_MEMBER} loadouts — delete one first.` },
            { status: 400 },
        )
    }

    const now = new Date()
    const result = await Db.loadouts.insertOne({
        userId: me.id,
        name,
        // The first loadout a member imports is their default; there is no
        // sensible alternative and it saves them a second click.
        isDefault: existing === 0,
        shared: false,
        raw,
        createdAt: now,
        updatedAt: now,
    } as MemberLoadout)

    await logAction({
        action: 'loadout.create',
        // 'member', singular — the ActionCategory union in types/logs.d.ts.
        category: 'member',
        performedBy: me.id,
        performedByName: me.username,
        entityType: 'loadout',
        entityId: String(result.insertedId),
    })

    return NextResponse.json({ id: String(result.insertedId) })
}
```

- [ ] **Step 4: Write the update/delete route**

Create `app/api/loadouts/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

const MAX_NAME = 40

/**
 * Both handlers scope every query by `userId: me.id`. The id in the URL is
 * never trusted on its own — that filter is what stops one member editing
 * another's loadout, so it must stay on every query in this file.
 */
async function ownedLoadout(id: string) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

    const doc = await Db.loadouts.findOne({ _id: new ObjectId(id), userId: me.id })
    if (!doc) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
    return { me, doc }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const owned = await ownedLoadout(id)
    if (owned.error) return owned.error
    const { me, doc } = owned

    const body = await req.json().catch(() => null)
    const set: Partial<MemberLoadout> = { updatedAt: new Date() }

    if (typeof body?.name === 'string' && body.name.trim()) set.name = body.name.trim().slice(0, MAX_NAME)
    if (typeof body?.shared === 'boolean') set.shared = body.shared

    if (body?.isDefault === true) {
        // Exactly one default per member: clear the others first.
        await Db.loadouts.updateMany({ userId: me.id }, { $set: { isDefault: false } })
        set.isDefault = true
    }

    await Db.loadouts.updateOne({ _id: doc._id, userId: me.id }, { $set: set })
    return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const owned = await ownedLoadout(id)
    if (owned.error) return owned.error
    const { me, doc } = owned

    await Db.loadouts.deleteOne({ _id: doc._id, userId: me.id })

    // Deleting the default would otherwise leave a member with loadouts but no
    // default, and the panel with nothing to show.
    if (doc.isDefault) {
        const next = await Db.loadouts.find({ userId: me.id }).sort({ updatedAt: -1 }).limit(1).toArray()
        if (next[0]) await Db.loadouts.updateOne({ _id: next[0]._id }, { $set: { isDefault: true } })
    }

    return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0.

If `logAction`'s `category` is rejected, use an existing value from the `ActionCategory` union in `types/logs.d.ts` — do not widen the union to fit this feature.

- [ ] **Step 6: Update the site map**

In `docs/map/d-misc-api.md` add:

```markdown
#### /api/loadouts
- **POST** — creates a loadout for the authenticated member from `{raw, name}`. Validates by parsing (`lib/loadout/parse.ts`); stores `raw` only. Caps: 64KB, 12 per member, 40-char name. First loadout becomes the default. Auth: any logged-in member, own records only.

#### /api/loadouts/[id]
- **PATCH** — rename, `shared` toggle, or `isDefault: true` (which clears the member's other defaults first).
- **DELETE** — removes it; deleting the default promotes the most recently updated survivor.
- Both scope every query by `userId` from `fetchMe()`, never the URL id alone.
```

In `docs/map/h-lib-types-components.md` add `lib/loadout/parse.ts` and the `MemberLoadout` type alongside the Task 2 entry.

- [ ] **Step 7: Commit**

```bash
git add apps/web/types/loadout.d.ts apps/web/lib/mongo.ts apps/web/app/api/loadouts apps/web/docs/map
git commit -m "feat(milpac): store and manage member loadouts"
```

---

### Task 6: The display panel

**Files:**
- Create: `app/(landing)/milpacs/[username]/loadout-panel.tsx`
- Modify: `app/(landing)/milpacs/[username]/profile.module.css`
- Modify: `app/(landing)/milpacs/[username]/page.tsx`
- Modify: `docs/map/g-public-pages.md`

**Interfaces:**
- Consumes: `parseLoadout` (Task 1), `resolveItemName` (Task 2), `iconFor` (Task 3), `LoadoutIcon` (Task 4), `MemberLoadout` (Task 5).
- Produces: `<LoadoutPanel loadout={MemberLoadout} actions?={React.ReactNode} />`, a server component.

- [ ] **Step 1: Write the panel**

Create `app/(landing)/milpacs/[username]/loadout-panel.tsx`:

```tsx
import { parseLoadout, type WeaponSlot, type Container } from '@/lib/loadout/parse'
import { resolveItemName } from '@/lib/loadout/names'
import { iconFor, type SlotContext as Slot } from '@/lib/loadout/classify'
import { LoadoutIcon } from '@/components/loadout/icons'
import s from './profile.module.css'

/**
 * A member's kit, in the arsenal's own arrangement: weapons across the top,
 * the three containers below, then what is worn and carried.
 *
 * A server component — name resolution reads a ~2.7MB dictionary that must
 * never reach the browser. Only the resolved strings are sent.
 *
 * Empty slots render as empty rather than being omitted: what a member chose
 * not to carry is part of the shape of a kit.
 */

function Weapon({ label, weapon, slot }: { label: string; weapon: WeaponSlot | null; slot: Slot }) {
    if (!weapon) {
        return (
            <div className={s.kitSlot}>
                <div className={`${s.lbl} ${s.kitSlotLabel}`}>{label}</div>
                <div className={s.kitEmpty}>—</div>
            </div>
        )
    }

    const attachments: [Slot, string | null][] = [
        ['optic', weapon.optic], ['pointer', weapon.pointer],
        ['muzzle', weapon.muzzle], ['bipod', weapon.bipod],
    ]

    return (
        <div className={s.kitSlot}>
            <div className={`${s.lbl} ${s.kitSlotLabel}`}>{label}</div>
            <div className={s.kitPrimary}>
                {/* Slot passed in, not inferred from the label — inferring it
                    gave the launcher a pistol icon. */}
                <LoadoutIcon icon={iconFor(weapon.className, slot)} size={20} />
                <span>{resolveItemName(weapon.className)}</span>
            </div>
            {weapon.magazine && (
                <div className={s.kitMag}>
                    <LoadoutIcon icon={iconFor(weapon.magazine.className)} size={13} />
                    {resolveItemName(weapon.magazine.className)}
                </div>
            )}
            <div className={s.kitAttachments}>
                {attachments.filter(([, c]) => c).map(([slot, c]) => (
                    <span key={slot} className={s.kitAttachment} title={resolveItemName(c!)}>
                        <LoadoutIcon icon={iconFor(c!, slot)} size={13} />
                        {resolveItemName(c!)}
                    </span>
                ))}
            </div>
        </div>
    )
}

function Bag({ label, container, slot }: { label: string; container: Container; slot: Slot }) {
    return (
        <div className={s.kitBag}>
            <div className={`${s.lbl} ${s.kitSlotLabel}`}>{label}</div>
            <div className={s.kitBagName}>
                <LoadoutIcon icon={iconFor(container?.className ?? '', slot)} size={18} />
                {container ? resolveItemName(container.className) : <span className={s.kitEmpty}>—</span>}
            </div>
            <ul className={s.kitList}>
                {(container?.contents ?? []).map((stack, i) => (
                    <li key={`${stack.className}-${i}`}>
                        <LoadoutIcon icon={iconFor(stack.className)} size={13} />
                        <span className={s.kitItemName}>{resolveItemName(stack.className)}</span>
                        <span className={s.kitCount}>{stack.count}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

export function LoadoutPanel({ loadout, actions }: { loadout: MemberLoadout; actions?: React.ReactNode }) {
    // The panel is only rendered for a stored loadout, which was validated on
    // import — but a parser change could still reject an old row, and that must
    // not take the whole profile down.
    let kit
    try {
        kit = parseLoadout(loadout.raw)
    } catch {
        return <p className={s.empty}>This loadout could not be read. Re-import it from ACE arsenal.</p>
    }

    const worn: [string, Slot, string | null][] = [
        ['Head', 'headgear', kit.headgear],
        ['Face', 'facewear', kit.facewear],
        ['Binos', 'binocular', kit.binocular?.className ?? null],
        ['Map', 'map', kit.assigned.map],
        ['GPS', 'gps', kit.assigned.gps],
        ['Radio', 'radio', kit.assigned.radio],
        ['Compass', 'compass', kit.assigned.compass],
        ['Watch', 'watch', kit.assigned.watch],
        ['NVG', 'nvg', kit.assigned.nvg],
    ]

    return (
        <div className={s.kit}>
            {actions && <div className={s.kitActions}>{actions}</div>}

            <div className={s.kitWeapons}>
                <Weapon label='Primary' weapon={kit.primary} slot='primary' />
                <Weapon label='Launcher' weapon={kit.launcher} slot='launcher' />
                <Weapon label='Sidearm' weapon={kit.handgun} slot='handgun' />
            </div>

            <div className={s.kitBags}>
                <Bag label='Uniform' container={kit.uniform} slot='uniform' />
                <Bag label='Vest' container={kit.vest} slot='vest' />
                <Bag label='Backpack' container={kit.backpack} slot='backpack' />
            </div>

            <div className={s.kitWorn}>
                {worn.map(([label, slot, cls]) => (
                    <div key={label} className={s.kitWornItem}>
                        <LoadoutIcon icon={iconFor(cls ?? '', slot)} size={15} />
                        <div>
                            <div className={s.lbl}>{label}</div>
                            <div className={s.kitWornName}>{cls ? resolveItemName(cls) : '—'}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Add the styles**

Append to `profile.module.css`, following the file's existing token vocabulary (`--s1`, `--line`, `--ink-2`, `--mono`):

```css
/* ── loadout ─────────────────────────────────────────────────────────────── */

.kit { display: flex; flex-direction: column; gap: 18px; }
.kitActions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.kitWeapons, .kitBags {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
}
.kitSlot, .kitBag {
    border: 1px solid var(--line);
    background: var(--s1);
    border-radius: var(--r);
    padding: 12px 14px;
}
.kitSlotLabel { margin-bottom: 8px; }
.kitPrimary { display: flex; align-items: center; gap: 9px; font-size: 14px; color: var(--ink); }
.kitMag, .kitAttachment {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--mono); font-size: 10px; color: var(--ink-2);
}
.kitMag { margin-top: 7px; }
.kitAttachments { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 7px; }
.kitEmpty { color: var(--ink-3); font-family: var(--mono); font-size: 12px; }

.kitBagName { display: flex; align-items: center; gap: 9px; font-size: 13px; margin-bottom: 10px; }
.kitList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.kitList li {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 0; border-top: 1px solid var(--line);
    font-size: 12px; color: var(--ink-2);
}
.kitItemName { flex: 1 1 auto; min-width: 0; }
.kitCount { font-family: var(--mono); font-size: 11px; color: var(--acc); }

.kitWorn {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    border-top: 1px solid var(--line);
    padding-top: 14px;
}
.kitWornItem { display: flex; align-items: center; gap: 9px; color: var(--ink-2); }
.kitWornName { font-size: 12px; color: var(--ink); }

@media (max-width: 900px) {
    .kitWeapons, .kitBags { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Wire it into the page**

In `page.tsx` (tabs, not spaces), fetch the member's loadouts alongside the existing data:

```tsx
	const loadouts = await Db.loadouts.find({ userId: member.id }).sort({ updatedAt: -1 }).toArray()
	const activeLoadout = loadouts.find(l => l.isDefault) ?? loadouts[0] ?? null
```

Replace the stub panel (currently `<Panel title='Assigned Loadout' tag='Standard' delay='.23s'>` with an `<Empty/>` inside) so it renders the real panel when one exists, and move it out of the right-hand column into a full-width section after the three-column `</div>`:

```tsx
			<div className={s.kitSection}>
				<Panel title='Assigned Loadout' tag={activeLoadout?.name} delay='.23s'>
					{activeLoadout
						? <LoadoutPanel loadout={activeLoadout} />
						: <Empty text='No loadout on record. Kit is imported from Arma.' />}
				</Panel>
			</div>
```

Add the section wrapper to `profile.module.css`:

```css
.kitSection { padding: 0 var(--pad) 40px; }
```

- [ ] **Step 4: Verify it renders**

Run: `npx tsc --noEmit` — expected exit 0.

Then, with the dev server running, insert a loadout for a test member and load their profile:

```bash
node -e "
require('dotenv').config({path:'../../.env'});
const {MongoClient}=require('mongodb');
(async()=>{
  const c=await MongoClient.connect(process.env.MONGO_URI);
  const db=c.db(process.env.MONGO_DB);
  const u=await db.collection('users').findOne({username:'itskodas'},{projection:{id:1}});
  await db.collection('loadouts').insertOne({userId:u.id,name:'Medic',isDefault:true,shared:false,raw:require('fs').readFileSync('SAMPLE.json','utf8').trim(),createdAt:new Date(),updatedAt:new Date()});
  console.log('seeded for', u.id); await c.close();
})()
"
```

Write the `SAMPLE` constant from **Task 1 Step 1** (the `JSON.stringify([...])` value) to `SAMPLE.json` first — it is a structurally complete export with every slot populated. Load `http://127.0.0.1:3000/milpacs/koda` and confirm: weapon names resolve to readable text, magazine counts appear, the three containers list their contents, and empty slots show "—". Delete the seeded row and `SAMPLE.json` afterwards.

- [ ] **Step 5: Update the site map and commit**

Add a `loadout-panel.tsx` entry to `docs/map/g-public-pages.md` under the `[username]` files, then:

```bash
git add apps/web/app/\(landing\)/milpacs apps/web/docs/map/g-public-pages.md
git commit -m "feat(milpac): render imported loadouts on the profile"
```

---

### Task 7: The import and management UI

**Files:**
- Create: `app/(landing)/milpacs/[username]/loadout-manager.tsx`
- Modify: `app/(landing)/milpacs/[username]/page.tsx`
- Modify: `docs/map/g-public-pages.md`
- Modify: `docs/superpowers/specs/2026-08-17-milpac-loadout-design.md` (status line)

**Interfaces:**
- Consumes: the routes from Task 5; `LoadoutPanel` (Task 6).
- Produces: `<LoadoutManager loadouts={...} isOwn={boolean} activeId={string} />`.

- [ ] **Step 1: Write the client component**

Create `app/(landing)/milpacs/[username]/loadout-manager.tsx`. It owns the switcher, the owner controls and the copy button; the panel itself stays a server component.

```tsx
'use client'

import { useState } from 'react'
import s from './profile.module.css'

/**
 * Owner controls and the loadout switcher.
 *
 * The import box states plainly that importing publishes the kit. That wording
 * is a requirement, not a nicety: the share toggle governs one-click copying,
 * not confidentiality, and a member who reads it as privacy has been misled.
 */

type Summary = { id: string; name: string; isDefault: boolean; shared: boolean; raw: string }

function copyText(text: string): boolean {
    // Mirrors copy-link.tsx: the Clipboard API needs a secure context, which a
    // dev server reached over a LAN IP is not.
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '-1000px'
    document.body.appendChild(field)
    field.select()
    try { return document.execCommand('copy') } catch { return false } finally { document.body.removeChild(field) }
}

export function LoadoutManager({ loadouts, isOwn, activeId }: {
    loadouts: Summary[]
    isOwn: boolean
    activeId: string | null
}) {
    const [importing, setImporting] = useState(false)
    const [raw, setRaw] = useState('')
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)

    const active = loadouts.find(l => l.id === activeId) ?? null

    const submit = async () => {
        setBusy(true); setError(null)
        const res = await fetch('/api/loadouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw, name }),
        })
        const json = await res.json().catch(() => ({}))
        setBusy(false)
        if (!res.ok) { setError(json.error ?? 'That import failed.'); return }
        window.location.reload()
    }

    const patch = async (id: string, body: Record<string, unknown>) => {
        setBusy(true)
        await fetch(`/api/loadouts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        window.location.reload()
    }

    const remove = async (id: string) => {
        if (!confirm('Delete this loadout?')) return
        setBusy(true)
        await fetch(`/api/loadouts/${id}`, { method: 'DELETE' })
        window.location.reload()
    }

    return (
        <div className={s.kitActions}>
            {loadouts.length > 1 && (
                <select
                    className={s.btn}
                    value={activeId ?? ''}
                    onChange={e => patch(e.target.value, { isDefault: true })}
                    aria-label='Choose a loadout'
                >
                    {loadouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            )}

            {active?.shared && (
                <button
                    type='button'
                    className={s.btn}
                    onClick={() => { setCopied(copyText(active.raw)); setTimeout(() => setCopied(false), 1800) }}
                >
                    {copied ? 'Copied' : 'Copy loadout'}
                </button>
            )}

            {isOwn && active && (
                <>
                    <button type='button' className={s.btn} disabled={busy}
                        onClick={() => patch(active.id, { shared: !active.shared })}>
                        {active.shared ? 'Sharing on' : 'Sharing off'}
                    </button>
                    <button type='button' className={`${s.btn} ${s.btnDanger}`} disabled={busy}
                        onClick={() => remove(active.id)}>Delete</button>
                </>
            )}

            {isOwn && (
                <button type='button' className={s.btn} onClick={() => setImporting(v => !v)}>
                    {importing ? 'Cancel' : 'Import loadout'}
                </button>
            )}

            {isOwn && importing && (
                <div className={s.kitImport}>
                    <p className={s.kitImportHelp}>
                        In game, open ACE arsenal, load the kit you want to record, then click
                        <strong> Export </strong> at the bottom of the arsenal screen and paste it here.
                        Anyone who visits your milpac can see every item in an imported loadout.
                    </p>
                    <input
                        className={s.kitImportName}
                        placeholder='Name (e.g. Medic)'
                        maxLength={40}
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                    <textarea
                        className={s.kitImportBox}
                        rows={5}
                        placeholder='Paste your ACE arsenal export'
                        value={raw}
                        onChange={e => setRaw(e.target.value)}
                    />
                    {error && <p className={s.kitImportError}>{error}</p>}
                    <button type='button' className={`${s.btn} ${s.btnAcc}`} disabled={busy || !raw.trim()} onClick={submit}>
                        {busy ? 'Importing' : 'Import'}
                    </button>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Add the import styles**

Append to `profile.module.css`:

```css
.kitImport {
    flex: 1 0 100%;
    display: flex; flex-direction: column; gap: 8px;
    border: 1px solid var(--line-2);
    background: var(--s1);
    border-radius: var(--r);
    padding: 14px;
    margin-top: 4px;
}
.kitImportHelp { margin: 0; font-size: 12px; color: var(--ink-2); line-height: 1.6; }
.kitImportName, .kitImportBox {
    background: var(--bg); border: 1px solid var(--line-2); border-radius: var(--r);
    color: var(--ink); padding: 8px 10px; font-family: var(--mono); font-size: 11px;
}
.kitImportBox { resize: vertical; }
.kitImportError { margin: 0; font-size: 12px; color: var(--crit); }
```

- [ ] **Step 3: Wire it into the page**

In `page.tsx`, pass the summaries into the panel's `actions` slot — `raw` is only handed to the client for loadouts that are `shared`, so an unshared export never reaches the browser:

```tsx
			<div className={s.kitSection}>
				<Panel title='Assigned Loadout' tag={activeLoadout?.name} delay='.23s'>
					{activeLoadout
						? (
							<LoadoutPanel
								loadout={activeLoadout}
								actions={
									<LoadoutManager
										isOwn={isOwn}
										activeId={String(activeLoadout._id)}
										loadouts={loadouts.map(l => ({
											id: String(l._id),
											name: l.name,
											isDefault: l.isDefault,
											shared: l.shared,
											raw: l.shared ? l.raw : '',
										}))}
									/>
								}
							/>
						)
						: isOwn
							? <LoadoutManager isOwn activeId={null} loadouts={[]} />
							: <Empty text='No loadout on record. Kit is imported from Arma.' />}
				</Panel>
			</div>
```

- [ ] **Step 4: Verify end to end**

Run: `npx tsc --noEmit` and `npx next lint --file "app/(landing)/milpacs/[username]/loadout-manager.tsx"` — both clean.

Then, logged in as a member, on your own milpac: click **Import loadout**, paste the sample export, name it, import. Confirm the panel renders it. Toggle **Sharing on**, reload, confirm **Copy loadout** appears and pastes back a string that `JSON.parse` accepts. Confirm that when logged out, the copy button is absent for an unshared loadout and the owner controls are gone.

Also confirm the negative case: paste `not an export` and check the message names the problem rather than failing silently.

- [ ] **Step 5: Mark the spec implemented and commit**

Change the spec's status line to `**Status:** implemented`.

```bash
git add apps/web/app/\(landing\)/milpacs apps/web/docs
git commit -m "feat(milpac): import, share and switch loadouts"
```

---

## Verification checklist

Run before calling the feature done:

- [ ] `npx vitest run` — all suites pass (64 existing + ~21 new).
- [ ] `npx tsc --noEmit` — exit 0.
- [ ] `npx next lint` on every changed file — clean.
- [ ] A member with no loadout sees the unchanged empty state; a visitor sees no owner controls.
- [ ] An unshared loadout's `raw` never appears in the page's HTML source.
- [ ] The Playwright E2E suite is **not** run without asking the user first.
