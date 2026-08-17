# Milpac Loadout / Kit — design

**Status:** implemented
**Panel:** `Assigned Loadout` on `/milpacs/[username]`, currently a stub reading
"No loadout on record. Kit is imported from Arma."

Two claims in this document were measured rather than assumed, and both were
load-bearing: the ACE export is valid JSON (§2), and the config dump resolves
every classname the panel will render (§4.1).

---

## 1. Why this exists

The milpac redesign spec (`2026-08-17-milpac-redesign-design.md` §1.10, §3.3)
found the Assigned Loadout panel had **no backend of any kind** — no collection,
field, or bot command anywhere in the monorepo records a member's gear — and
recommended dropping it. This spec builds it instead, on the strength of one
fact that was not considered at the time: **ACE arsenal can export a member's
entire kit as a single string the member can paste in themselves.** That removes
the objection that killed Option C, which was the per-member maintenance burden.

The goal is an Arma-arsenal-like view of a member's kit on their public milpac:
weapon slots with their attachments, the three containers with their contents,
headgear/facewear/binocular, and assigned items.

---

## 2. The import format — verified, not assumed

A member opens ACE arsenal, loads their kit, and clicks **Export** at the bottom.
That copies ARMA's `getUnitLoadout` array wrapped in ACE's own extras block.

**It is valid JSON.** Verified by `JSON.parse` against a real ASOT export — no
SQF parser is needed, which removes the single largest technical risk in this
feature. Everything below was confirmed against that sample.

```
[ <loadout>, <aceExtras> ]
```

`<loadout>` is a 10-element array with **positional** slots:

| # | Slot | Shape |
|---|---|---|
| 0 | primary | `[class, muzzle, pointer, optic, [mag, ammo], [mag2, ammo], bipod]` |
| 1 | launcher | same shape, `[]` when empty |
| 2 | handgun | same shape |
| 3 | uniform | `[class, [[item, count], ...]]` |
| 4 | vest | same shape |
| 5 | backpack | same shape |
| 6 | headgear | `string` |
| 7 | facewear | `string` |
| 8 | binocular | weapon shape |
| 9 | assignedItems | `[map, gps, radio, compass, watch, nvg]` |

Container stacks have **two forms**, and conflating them is the easy bug:

- `["ACE_EarPlugs", 1]` — an item, with a count.
- `["Taser_mag", 4, 2]` — a magazine: 4 of them, each holding 2 rounds.

`["ACE_painkillers", 1, 10]` is therefore one stack of ten uses, not ten stacks.

`<aceExtras>` is `[["ace_arsenal_insignia", <class>], ["ace_earplugs", <bool>]]`.
Not part of the loadout proper; the insignia is worth rendering, the earplug
flag is not.

**Tolerate the bare form.** Some paths produce the 10-element loadout with no
extras wrapper. Detect by shape: a 2-element outer array whose `[0]` is itself a
10-element array is wrapped; a bare 10-element array is not.

---

## 3. Data model

A new **`Db.loadouts`** collection, not a field on `User`. `User` lives in the
monorepo-root `types/` and is shared with `apps/bot` against the same documents;
a web-only feature has no business widening it, and a member's loadouts are an
unbounded list that would bloat every user fetch the bot makes.

`apps/web/types/loadout.d.ts`:

```ts
interface MemberLoadout {
    _id: ObjectId
    /** Discord id — the same key every other member-scoped collection uses. */
    userId: string
    /** Member-supplied label, e.g. "Medic". Max 40 chars. */
    name: string
    /** Exactly one per member is true; enforced on write, not by index. */
    isDefault: boolean
    /** Opt-in: may other members copy the export string? Defaults false. */
    shared: boolean
    /** The ACE export, stored verbatim. The source of truth. */
    raw: string
    createdAt: Date
    updatedAt: Date
}
```

**Only `raw` is stored — the parse happens at render.** Storing a denormalised
copy would mean every improvement to the parser or the name dictionary leaves
old rows stale and needs a migration. Parsing is a `JSON.parse` plus a
restructure of a ~60-entry array; it is not worth caching. Nothing queries by
item, so there is no index to lose.

**Guards on write:** `raw` capped at 64KB, structurally validated (see §5), and
a member capped at 12 loadouts so the collection cannot be used as storage.

---

## 4. Name resolution

The export carries classnames only. `CUP_30Rnd_556x45_X95_Tracer_Green` has to
become "5.56mm 30Rnd X95 (Green tracer)". Three layers, in order:

1. **Generated dictionary** — `lib/loadout/generated/arma-items.json`, produced
   by dumping `displayName` in-game for every class with `scope >= 2` (or
   `scopeArsenal >= 2`) across four config roots. **This dump has been taken.**
2. **Hand overrides** — `lib/loadout/overrides.ts`, a small map for cases where
   the config name is unhelpful or the unit prefers its own wording. Wins over
   the generated file.
3. **Algorithmic fallback** — strip a known vendor prefix (`CUP_`, `ACE_`,
   `kat_`, `TFAR_`, `MRH_`, `ASOT_`), drop type infixes (`arifle_`, `optic_`,
   `acc_`), split on underscores, title-case. `CUP_arifle_M4A3_black` →
   "M4A3 Black".

Layer 3 alone is the whole feature's floor: **if the dictionary is stale or
absent, the panel still works**, with uglier labels. That is deliberate — the
feature must not be blocked on an out-of-band artefact.

### 4.1 The dump, as taken

31,583 entries. **Measured against the sample loadout: 55 of 56 classnames
resolve.** The single miss is `CUP_insignia_ua_krakenlowvis` — unit insignia
live in `CfgUnitInsignia`, which is not among the roots dumped. See §9.

| Root | Rows | Carries |
|---|---|---|
| `CfgMagazines` | 16,441 | magazines, grenades, explosives |
| `CfgWeapons` | 11,547 | weapons, attachments, uniforms, vests, headgear, NVGs, radios, most ACE/KAT items |
| `CfgVehicles` | 3,200 | backpacks only (`isKindOf "Bag_Base"`) |
| `CfgGlasses` | 395 | facewear |

Each row carries `class | root | ItemInfo.type | mass | count | source mod |
inheritance chain | displayName`. Categorisation is done **in TypeScript, not in
the SQF**: rules will be wrong on the first pass, and iterating on them must not
require relaunching Arma with the full modlist.

**`ItemInfo.type` codes, confirmed empirically against this dump** — not assumed.
Note 605 is headgear, not glasses, which is the sort of thing that would have
silently mis-slotted every helmet:

| Code | Meaning | Code | Meaning |
|---|---|---|---|
| 101 | muzzle | 605 | headgear |
| 201 | optic | 616 | NVG |
| 301 | pointer | 620 | toolkit |
| 302 | bipod | 621 | UAV terminal |
| 701 | vest | 401 | first aid kit |
| 801 | uniform | 619 | medikit |

Type is `0` for 6,559 rows — weapons proper, and container items such as
medical supplies. Those are classified from the inheritance chain, the source
mod (`@ace`, KAT) and finally the classname.

### 4.2 Shape and size

Stored as `{classname: [displayName, root, type, sourceMod]}` — every signal
that is *not* derivable from the classname, and nothing that is. The
inheritance chain is dropped from the runtime file; it is only needed if the
classifier is ever rebuilt, and the raw dump is the place to go for that.

**2.72 MB on disk, ~240 KB once git packs it.** Committed to the repo rather
than kept in `storage/`: a bind-mounted file is absent from a fresh environment
and would degrade to layer 3 silently, with no error to notice.

Resolution happens **server-side**, in the page's server component — the browser
receives only the resolved strings for the ~60 items in one loadout, never the
table.

---

## 5. Import flow

A paste box on the member's own milpac, in the same family as the existing cover
upload and bio editor. Copy for the member:

> Open ACE arsenal in-game, load the kit you want to record, then click
> **Export** at the bottom of the arsenal screen. That copies your loadout to
> your clipboard — paste it here.

`POST /api/loadouts` with `{ raw, name }`, authenticated as the member:

1. Length check (64KB).
2. `JSON.parse` — on failure, "That does not look like an ACE arsenal export."
3. Shape check: resolve wrapped vs bare (§2), assert 10 slots, assert each slot
   is the expected type. On failure, name the slot that failed rather than
   rejecting generically — a member with a malformed paste needs to know whether
   they copied the wrong thing or hit a truncation.
4. Loadout count check (12).
5. Insert. First loadout for a member is `isDefault: true` automatically.

`PATCH /api/loadouts/[id]` — rename, set default, toggle `shared`.
`DELETE /api/loadouts/[id]` — with a re-election rule: deleting the default
promotes the most recently updated survivor.

All three routes operate **only on the caller's own records** — `userId` comes
from `client.fetchMe()`, never from the request body. Staff cannot edit another
member's loadout; kit is self-reported, and staff editing it would make the
record ambiguous about who entered what.

---

## 6. Icons

~50 inline SVGs in `components/loadout/icons.tsx`, classified by a pure
`iconFor(classname, slotContext)` in `lib/loadout/classify.ts`.

Slot context does most of the work for free — anything in slot 3 is a uniform,
anything in `pointer` is a laser — so classification by classname is only needed
for container contents. Rules are ordered prefix/substring tests against the
classname, falling through to a generic "item" mark. Granularity: rifle, carbine,
DMR, sniper, MG, launcher, pistol, taser; optic, holo, laser, suppressor, bipod,
grip; magazine, belt, grenade, smoke, flashbang, explosive; tourniquet, bandage,
IV, syringe, splint, airway, chest seal, surgical, medication, diagnostic;
radio, GPS, map, compass, watch, NVG, rangefinder, IR strobe; uniform, vest,
backpack, helmet, facewear; tool, document, misc.

`classify.ts` is pure and unit-tested — it is the piece most likely to silently
mis-bucket a new mod, and a test is cheaper than noticing on the page.

---

## 7. The panel

Full-width section **below** the three-column body. The arsenal layout needs
horizontal room the right-hand column cannot give it even at its new width.

```
ASSIGNED LOADOUT                    [ Medic ▾ ]  [ Copy loadout ]

  PRIMARY                LAUNCHER              HANDGUN
  ┌─────────────┐        ┌─────────────┐       ┌─────────────┐
  │ M4A3 Black  │        │   (empty)   │       │   Taser     │
  └─────────────┘        └─────────────┘       └─────────────┘
   optic · laser · bipod                        Taser Mag ×2
   30Rnd Green Tracer

  UNIFORM                VEST                  BACKPACK
  ASOT AMCU              Peacekeeper Mk5       Patrol Bullock (Medic)
  ─────────────          ─────────────         ─────────────
  ▸ P.D.A.        1      ▸ Fiberscope    1     ▸ 16g IV          8
  ▸ Earplugs      1      ▸ microDAGR     1     ▸ Adenosine       4
  …                      …                     …

  HEAD  FACE  BINOS  ·  MAP  GPS  RADIO  COMPASS  WATCH  NVG
```

- The loadout switcher appears only when a member has more than one; the default
  is selected on load.
- "Copy loadout" appears only when that loadout is `shared`. It copies `raw`,
  reusing the clipboard-with-fallback logic already written for `copy-link.tsx`
  (the Clipboard API needs a secure context, which a LAN-IP dev server is not).
- Empty slots render as empty, not omitted — the shape of a kit includes what
  the member chose not to carry.
- Owner-only controls (import, rename, set default, share toggle, delete) render
  behind the `isOwn` flag the page already computes.

---

## 8. Explicitly out of scope

- **Weight.** Arma's `29.18kg` comes from per-item mass in configs. The dump
  could carry it, but nothing else here needs it and it invites arguments about
  accuracy against a live game.
- **Real item artwork.** Config `picture` paths point at `.paa` textures inside
  mod PBOs; using them means extracting and converting hundreds of files. The
  icon set is the deliberate substitute. Revisit only if the unit wants it.
- **Staff editing another member's loadout** (§5).
- **Loadout history / versioning.** An import replaces that named loadout.
- **Bot integration.** No `/loadout` command in this pass.
- **Unit insignia.** `CfgUnitInsignia` is not dumped, so the extras block's
  `ace_arsenal_insignia` is parsed and discarded rather than rendered.

---

## 9. Risks

- **The dictionary is an out-of-band artefact.** It is generated by a human
  running a script in-game and goes stale when the modlist changes. Mitigated by
  the fallback layer, but a stale dictionary shows old names for renamed items
  and is not self-correcting. Regenerating is a manual chore nobody owns yet.
  The SQF script should be committed alongside the generated file so the next
  person does not have to reconstruct it.
- ~~Insignia are not covered~~ — resolved by dropping them from scope (§8). The
  `ace_arsenal_insignia` entry in the extras block is parsed and ignored. With
  that, **every classname the panel renders resolves**.
- ~~Committing a multi-MB JSON~~ — resolved. Measured at 2.72 MB, ~240 KB packed.
- **Positional parsing is brittle to Arma changes.** `getUnitLoadout`'s shape has
  been stable for years, but a future change is silent: the parse would succeed
  and render the wrong thing. The shape assertions in §5 limit this to slots
  whose type changes, not slots whose meaning changes.
- **The share toggle is weaker than it sounds** (§7), and this is accepted
  deliberately. The panel publishes every item regardless; the toggle governs
  one-click reuse, not confidentiality. Importing a loadout *is* the act of
  publishing it. The import copy must therefore say so plainly, or members will
  read the toggle as privacy — that wording is a requirement, not a nicety.

---

## 10. Decisions taken

| Decision | Choice |
|---|---|
| Item names | Generated dump, hand overrides, algorithmic fallback |
| Placement | Full-width section below the three columns |
| Icon granularity | ~50, finer than category-level |
| Who imports | The member, on their own milpac only |
| How many | Multiple named loadouts, one nominated default |
| Sharing | Per-loadout opt-in copy, default off |
| Storage | New `Db.loadouts`; `raw` only, parsed at render |
| Dictionary | Taken: 31,583 entries, 2.72 MB committed; full coverage in scope |
| Insignia | Out of scope — parsed and ignored |
| Visibility | Importing publishes the kit; the toggle governs copying only |

No open questions remain.
