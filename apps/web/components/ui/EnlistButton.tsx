'use client'

import React from 'react'
import Button, { type ButtonVariant } from './Button'
import { useEnlistTransition, EnlistFadeOverlay } from '@/components/enlist-transition'

/**
 * "Enlist now" — fades the screen to black, then the join video.
 *
 * Self-contained (it carries its own overlay) so any surface can drop one in
 * without wiring up the transition itself. Several may be mounted at once —
 * the hero and the enlist band both have one — and only the pressed instance
 * ever becomes visible, since each owns its own state.
 */
export default function EnlistButton({
    variant = 'red',
    size = 'md',
    className,
    children = 'Enlist now',
}: {
    variant?: ButtonVariant
    size?: 'md' | 'sm'
    className?: string
    children?: React.ReactNode
}) {
    const { fading, enlist } = useEnlistTransition()

    return (
        <>
            <EnlistFadeOverlay fading={fading} />
            <Button variant={variant} size={size} className={className} onClick={enlist}>
                {children}
            </Button>
        </>
    )
}
