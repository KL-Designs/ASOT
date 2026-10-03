'use client'

import React from 'react'
import Button, { type ButtonVariant } from './Button'
import { ENLIST_HREF } from '@/components/enlist-transition'

/**
 * "Enlist now".
 *
 * Points at the Discord invite for now: the /join flow is still a work in
 * progress, and enlistment currently happens through Discord. Once /join is
 * ready, switch back to `useEnlistTransition` + `EnlistFadeOverlay` from
 * components/enlist-transition (fade to black, then the join video).
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
    return (
        <Button variant={variant} size={size} className={className} href={ENLIST_HREF} external>
            {children}
        </Button>
    )
}
