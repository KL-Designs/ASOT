import Link from 'next/link'
import styles from './medical-menu-link.module.css'

/* ============================================================================
   The only link to HZN-MED.

   Sits at the foot of one member's overview (see MEDICAL_MENU_MEMBER in
   milpac-file.tsx) as a dim caduceus that only resolves into a label on hover.
   Meant to be found rather than advertised — which is also why the route it
   points at is unlisted rather than gated.

   A plain link now that the menu is a page of its own: none of it is in this
   bundle, so every other milpac carries nothing at all for it.
   ========================================================================== */

export function MedicalMenuLink() {
    return (
        <div className={styles.wrap}>
            <Link href='/ace' className={styles.link} title='HZN-MED · Field medical trainer'>
                <span className={styles.mark} aria-hidden>⚕</span>
                <span className={styles.label}>HZN-MED</span>
            </Link>
        </div>
    )
}

export default MedicalMenuLink
