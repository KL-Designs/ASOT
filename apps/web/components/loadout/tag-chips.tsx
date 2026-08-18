import { KIT_TAG_LABELS, type KitTag } from '@/lib/loadout/tags'
import s from '@/app/(landing)/milpacs/[username]/profile.module.css'

/**
 * A kit's tags, as chips.
 *
 * No client boundary — it renders text. Both the shelf card and the kit panel
 * use it, so it lives here rather than in either page, and it draws on
 * `profile.module.css` for the same reason the shelf does: that file is the
 * design system both pages already share.
 *
 * Renders nothing at all for an untagged kit rather than an empty row, so a
 * card without tags keeps its height.
 */
export function TagChips({ tags }: { tags: KitTag[] }) {
    if (tags.length === 0) return null
    return (
        <ul className={s.tagChips}>
            {tags.map(tag => (
                <li key={tag} className={s.tagChip}>{KIT_TAG_LABELS[tag]}</li>
            ))}
        </ul>
    )
}
