import { parseLoadout, type WeaponSlot, type Container } from '@/lib/loadout/parse'
import { resolveItemName } from '@/lib/loadout/names'
import { iconFor, type SlotContext as Slot } from '@/lib/loadout/classify'
import { LoadoutIcon } from '@/components/loadout/icons'
import { Stars } from '@/components/loadout/stars'
import { TagChips } from '@/components/loadout/tag-chips'
import type { KitTag } from '@/lib/loadout/tags'
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

export function LoadoutPanel({ loadout, tags, rating, actions }: {
    loadout: MemberLoadout
    tags: KitTag[]
    /** Absent on a kit that cannot be rated at all — an unpublished one. */
    rating?: {
        loadoutId: string
        avg: number
        count: number
        /** The viewer's own rating, never anyone else's. */
        mine: number | null
        canRate: boolean
    }
    actions?: React.ReactNode
}) {
    // The panel is only rendered for a stored loadout, which was validated on
    // import — but a parser change could still reject an old row, and that must
    // not take the whole profile down.
    let kit
    try {
        kit = parseLoadout(loadout.raw)
    } catch (err) {
        console.error('[loadout] could not parse stored loadout', loadout._id, err)
        return <p className={s.empty}>This kit could not be read. Re-import it from ACE arsenal.</p>
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

            {/* What the kit is for, and what the unit makes of it — above the
                gear, because both are read before the item list is. Absent
                entirely on a private kit: an unpublished kit has no audience
                to have an opinion. */}
            {(tags.length > 0 || rating) && (
                <div className={s.kitMeta}>
                    <TagChips tags={tags} />
                    {rating && (
                        <Stars
                            avg={rating.avg}
                            count={rating.count}
                            mine={rating.mine}
                            loadoutId={rating.loadoutId}
                            interactive={rating.canRate}
                            size={16}
                        />
                    )}
                </div>
            )}

            <div className={s.kitBody}>
                <div className={s.kitWorn}>
                    {worn.map(([label, slot, cls]) => (
                        <div key={label} className={s.kitWornItem}>
                            <LoadoutIcon icon={iconFor(cls ?? '', slot)} size={30} />
                            <div>
                                <div className={s.lbl}>{label}</div>
                                <div className={s.kitWornName}>{cls ? resolveItemName(cls) : '—'}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className={s.kitMain}>
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
                </div>
            </div>
        </div>
    )
}
