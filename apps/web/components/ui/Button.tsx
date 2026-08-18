import React from 'react'
import Link from 'next/link'
import s from '@/styles/ui.module.css'

/**
 * The notched action button.
 *
 * One silhouette at several volumes, so a cluster of actions can be pitched at
 * different weights without looking like different components. The rule that
 * makes it work: **only one button in a cluster is ever solid-filled** —
 * whichever is the primary action for the current state. If everything is loud,
 * nothing is.
 *
 * Renders an `<a>` when given `href`, a `<button>` otherwise, so a link stays a
 * link and a handler stays a button.
 */

export type ButtonVariant = 'red' | 'ghost' | 'amber' | 'discord' | 'dark'

type Common = {
    variant?: ButtonVariant
    size?: 'md' | 'sm'
    block?: boolean
    className?: string
    children: React.ReactNode
}

type Props = Common & (
    | ({ href: string, external?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common | 'href'>)
    | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof Common>)
)

const VARIANTS: Record<ButtonVariant, string> = {
    red: s.btnRed,
    // Discord builds on the ghost treatment and only takes brand blue on hover
    // — present everywhere, loud nowhere.
    ghost: s.btnGhost,
    amber: s.btnAmber,
    discord: `${s.btnGhost} ${s.btnDiscord}`,
    dark: s.btnDark,
}

export default function Button({
    variant = 'red',
    size = 'md',
    block = false,
    className = '',
    children,
    ...rest
}: Props) {
    const classes = [
        s.btn,
        VARIANTS[variant],
        size === 'sm' ? s.btnSm : '',
        block ? s.btnBlock : '',
        className,
    ].filter(Boolean).join(' ')

    if ('href' in rest && rest.href) {
        const { href, external, ...anchorProps } = rest as { href: string, external?: boolean } & React.AnchorHTMLAttributes<HTMLAnchorElement>

        // External destinations skip next/link — it has nothing to prefetch, and
        // the rel guard belongs on them rather than on internal routes.
        if (external) return (
            <a href={href} target='_blank' rel='noopener noreferrer' className={classes} {...anchorProps}>
                {children}
            </a>
        )

        return <Link href={href as any} className={classes} {...anchorProps}>{children}</Link>
    }

    const buttonProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>
    return <button type='button' className={classes} {...buttonProps}>{children}</button>
}
