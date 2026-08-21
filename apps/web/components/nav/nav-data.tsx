import React from 'react'
import {
    Home, InfoOutlined, Tag, ContactMail, Gavel, AutoAwesome, HelpOutline, SupportAgent,
    Group, MilitaryTech, Backpack, EmojiEvents, Badge,
    TrackChanges, MapOutlined, Collections, Handshake,
} from '@mui/icons-material'

/**
 * The public navigation tree, shared by the desktop bar and the mobile sheet so
 * the two can't drift apart.
 *
 * Six top-level items. `Support` used to sit alongside them and no longer does:
 * it is the wellbeing/crisis-resources page, which the redesign's DONATE button
 * does not stand in for, but it doesn't earn a slot of its own either — every
 * item removed from the top level buys back roughly 90px of bar. It now sits
 * under `Community`, which is where the pages about looking after the people in
 * the unit belong; `About Us` is about the unit itself.
 */

export type NavChild = {
    name: string
    href: string
    description: string
    icon: React.JSX.Element
}

export type NavItem = {
    name: string
    /** Where the label itself points. Parents with children use it for the active check. */
    href: string
    icon: React.JSX.Element
    children?: NavChild[]
    /**
     * Pins the next-operation card into this menu's panel.
     *
     * Opt-in per item rather than derived from how many children a menu has:
     * the card belongs where someone is already thinking about operations, and
     * a count-based rule put it under `Community` — which has nothing to do with
     * what is on this weekend — while leaving `Operations` without it.
     */
    feature?: 'nextOp'
}

export const NAV_ITEMS: NavItem[] = [
    { name: 'Home', href: '/', icon: <Home /> },
    {
        name: 'About Us', href: '/about', icon: <InfoOutlined />,
        children: [
            { name: 'About Us', href: '/about', icon: <InfoOutlined />, description: 'Learn about our unit and history' },
            { name: 'Callsigns', href: '/about/callsigns', icon: <Tag />, description: 'Platoon and section callsigns' },
            { name: 'Contact', href: '/about/contact', icon: <ContactMail />, description: 'Get in touch with us' },
            { name: 'Rules', href: '/about/rules', icon: <Gavel />, description: 'Unit rules and regulations' },
            { name: 'Principles & Values', href: '/about/values', icon: <AutoAwesome />, description: 'What we stand for' },
            { name: 'FAQ', href: '/about/faq', icon: <HelpOutline />, description: 'Frequently asked questions' },
        ],
    },
    {
        name: 'Community', href: '/orbat', icon: <Group />,
        children: [
            { name: 'ORBAT', href: '/orbat', icon: <Group />, description: "ASOT's callsign structure" },
            { name: 'MILPACS', href: '/milpacs', icon: <MilitaryTech />, description: 'Military Personnel Accounting Centre' },
            { name: 'Kits', href: '/kits', icon: <Backpack />, description: 'Kits members have shared with the unit' },
            { name: 'Retired Members', href: '/retired', icon: <EmojiEvents />, description: 'Members who have served with ASOT' },
            { name: 'Biographies', href: '/bios', icon: <Badge />, description: 'Meet our staff' },
            { name: 'Support', href: '/support', icon: <SupportAgent />, description: 'Wellbeing and crisis resources' },
        ],
    },
    {
        name: 'Operations', href: '/operations', icon: <TrackChanges />,
        feature: 'nextOp',
        children: [
            { name: 'Operations', href: '/operations', icon: <TrackChanges />, description: 'Browse all unit operations' },
            { name: 'Interactive Map', href: '/maps', icon: <MapOutlined />, description: 'Explore available maps interactively' },
        ],
    },
    { name: 'Gallery', href: '/gallery', icon: <Collections /> },
    { name: 'Partners', href: '/partnerships', icon: <Handshake /> },
]

/** True when `pathname` is inside the item — including any of its children. */
export function isItemActive(item: NavItem, pathname: string): boolean {
    if (item.href === '/') return pathname === '/'
    if (pathname.startsWith(item.href)) return true
    return item.children?.some(c => c.href !== '/' && pathname.startsWith(c.href)) ?? false
}
