'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { useState, useEffect } from 'react'

import { Button, IconButton, Drawer, Divider, Menu, MenuItem, Collapse } from '@mui/material'
import { AccountCircle, Home, School, Group, MilitaryTech, TrackChanges, Collections, Handshake, Support, VolunteerActivism, Login, Logout, Menu as MenuIcon, ArrowRight, ArrowDropDown, InfoOutlined, Tag, ContactMail, Gavel, AutoAwesome, HelpOutline, AccountTree, Badge, Close, ExpandMore, ExpandLess, EmojiEvents, KeyboardArrowUp, Person, AdminPanelSettings, Api, Tune } from '@mui/icons-material'

import Navigation from '@/styles/navigation.module.css'
import { rankNameFromAbbr } from '@/lib/ranks'
import Avatar from '@/components/member/avatar'
import NotificationBell from '@/app/admin/_components/NotificationBell'

import Logo from '@/public/logo.png'
import MapBg from '@/public/designs/map.png'



type SubLink = {
    name: string
    link: string
    icon: React.JSX.Element
    description: string
}

type Link = ({
    name: string
    href: string
    icon: React.JSX.Element
    subLinks?: undefined
} | {
    name: string
    href: string
    icon: React.JSX.Element
    subLinks: SubLink[]
})



export default function Navbar() {

    const [sideMenuOpen, setSideMenuOpen] = useState(false)
    const [user, setUser] = useState<User | null>(null)
    const [scrolled, setScrolled] = useState(false)
    const [scrollBtnHovered, setScrollBtnHovered] = useState(false)
    const pathname = usePathname()

    const Links: Link[] = [
        { name: 'Home', href: '/', icon: <Home /> },
        {
            name: 'About Us', href: '/about', icon: <School />,
            subLinks: [
                { name: 'About Us', link: '/about', icon: <InfoOutlined />, description: 'Learn about our unit and history' },
                { name: 'Callsigns', link: '/about/callsigns', icon: <Tag />, description: 'Platoon and section callsigns' },
                { name: 'Contact', link: '/about/contact', icon: <ContactMail />, description: 'Get in touch with us' },
                { name: 'Rules', link: '/about/rules', icon: <Gavel />, description: 'Unit rules and regulations' },
                { name: 'Principles & Values', link: '/about/values', icon: <AutoAwesome />, description: 'What we stand for' },
                { name: 'FAQ', link: '/about/faq', icon: <HelpOutline />, description: 'Frequently asked questions' },
            ]
        },
        {
            name: 'Our Orbat', href: '/community', icon: <AccountTree />,
            subLinks: [
                { name: 'ORBAT', link: '/community/orbat', icon: <Group />, description: "ASOT's Callsign Structure" },
                { name: 'MILPACS', link: '/milpacs', icon: <MilitaryTech />, description: 'Military Personnel Accounting Centre' },
                { name: 'Biographies', link: '/community/bios', icon: <Badge />, description: 'Meet our Staff' },
                // { name: 'Hall of Fame', link: '/community/hof', icon: <EmojiEvents />, description: 'Honoured unit members' },
            ]
        },
        { name: 'Operations', href: '/operations', icon: <TrackChanges /> },
        { name: 'Gallery', href: '/gallery', icon: <Collections /> },
        { name: 'Partners', href: '/partnerships', icon: <Handshake /> },
        { name: 'Support', href: '/support', icon: <Support /> },
    ]


    useEffect(() => {
        fetch('/api/me')
            .then(res => res.json())
            .then(json => {
                if (json.error) return
                setUser(json)
            })
            .catch(() => { })
    }, [])

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10)
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])


    return (
        <>
            <div
                className='sticky top-0 z-50'
                style={{
                    width: '100%',
                    borderBottom: '1px solid var(--primary)',
                    backgroundColor: scrolled ? 'rgba(10,10,10,0.82)' : 'var(--background)',
                    backdropFilter: scrolled ? 'blur(16px)' : 'none',
                    WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
                    transition: 'background-color 0.3s ease, backdrop-filter 0.3s ease',
                }}
            >

                <div className='absolute w-full h-full' style={{ top: 0, left: 0 }}>
                    <Image src={MapBg} alt='map' fill className='object-cover opacity-15' />
                </div>

                <div className='flex flex-row justify-between gap-10 px-[30px]' style={{ zIndex: 1, padding: scrolled ? '7px 30px' : '11px 30px', transition: 'padding 0.3s ease' }}>
                    <div className='min-w-[50px] self-center flex flex-row items-center gap-x-3'>
                        <Link href='/'>
                            <IconButton style={{ padding: 0 }}>
                                <Image src={Logo} width={scrolled ? 36 : 42} quality={100} alt='Logo' style={{ transition: 'width 0.3s ease' }} />
                            </IconButton>
                        </Link>
                    </div>

                    <div className='hidden md:flex flex-row flex-wrap justify-end gap-x-10 gap-y-2 self-center'>
                        {Links.map((link) => {
                            if (!link.subLinks) {
                                const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
                                return (
                                    <Link key={link.name} href={link.href as any} target='_self'>
                                        <Button
                                            startIcon={link.icon}
                                            color='light'
                                            style={{
                                                borderBottom: isActive ? '2px solid var(--red)' : '2px solid transparent',
                                                borderRadius: 0,
                                                opacity: isActive ? 1 : 0.75,
                                                transition: 'border-color 0.2s, opacity 0.2s',
                                            }}
                                        >
                                            {link.name}
                                        </Button>
                                    </Link>
                                )
                            }

                            const isActive = pathname.startsWith(link.href)
                            return <DropDownMenu key={link.name} data={link} isActive={isActive} />
                        })}
                    </div>

                    <div className='flex self-center gap-x-3'>
                        <Link href='/donate' title='Donate' className='self-center'>
                            <div className={Navigation['nav-button']}>
                                <VolunteerActivism />
                            </div>
                        </Link>

                        {user && (user as any).isStaff && (
                            <div className='self-center hidden md:flex items-center gap-x-3'>
                                <NotificationBell />
                                <Link href='/admin' title='Member Portal'>
                                    <div className={Navigation['nav-button']} style={{ color: '#00c3ff', borderColor: 'rgba(0,195,255,0.4)', filter: 'drop-shadow(0 0 4px rgba(0,195,255,0.3))' }}>
                                        <AdminPanelSettings style={{ fontSize: 20 }} />
                                    </div>
                                </Link>
                            </div>
                        )}

                        {user ?
                            <ProfileDropdown user={user} />
                            :
                            <Link href='/login' title='Login'>
                                <div className={Navigation['nav-button']}>
                                    <AccountCircle />
                                </div>
                            </Link>
                        }

                        <div className={Navigation['nav-button'] + ' visible md:hidden'} onClick={() => setSideMenuOpen(true)}>
                            <MenuIcon />
                        </div>
                    </div>
                </div>

            </div>

            {/* Scroll to top */}
            <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                onMouseEnter={() => setScrollBtnHovered(true)}
                onMouseLeave={() => setScrollBtnHovered(false)}
                style={{
                    position: 'fixed',
                    bottom: 28,
                    right: 28,
                    zIndex: 50,
                    width: 40,
                    height: 40,
                    background: 'rgba(10,10,10,0.85)',
                    border: `1px solid rgba(219,0,29,${scrollBtnHovered ? 0.7 : 0.35})`,
                    color: scrollBtnHovered ? 'rgba(237,237,237,1)' : 'rgba(237,237,237,0.75)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: scrollBtnHovered
                        ? '0 0 16px 4px rgba(219,0,29,0.5), 0 0 4px 1px rgba(219,0,29,0.4)'
                        : '0 0 6px 1px rgba(219,0,29,0.18)',
                    transition: 'opacity 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, color 0.25s ease',
                    opacity: scrolled ? 1 : 0,
                    pointerEvents: scrolled ? 'auto' : 'none',
                    transform: scrolled ? 'translateY(0)' : 'translateY(10px)',
                }}
            >
                <KeyboardArrowUp style={{ fontSize: 22 }} />
            </button>

            <Drawer
                open={sideMenuOpen}
                onClose={() => setSideMenuOpen(false)}
                slotProps={{
                    paper: {
                        style: {
                            width: 280,
                            background: '#0a0a0a',
                            borderRight: '1px solid rgba(219, 0, 29, 0.3)',
                            display: 'flex',
                            flexDirection: 'column',
                        }
                    }
                }}
            >
                <div className='flex justify-between items-center p-[12px_16px]'>
                    <Link href='/' onClick={() => setSideMenuOpen(false)}>
                        <Image src={Logo} width={45} alt='Logo' />
                    </Link>
                    <IconButton onClick={() => setSideMenuOpen(false)} style={{ color: 'rgba(237,237,237,0.6)' }}>
                        <Close />
                    </IconButton>
                </div>

                <Divider style={{ borderColor: 'rgba(219, 0, 29, 0.4)' }} />

                <div className='flex-1 overflow-y-auto p-2'>
                    {Links.map(link => (
                        <MobileNavItem key={link.name} link={link} onClose={() => setSideMenuOpen(false)} />
                    ))}
                </div>

                {(user as any)?.isStaff && (
                    <>
                        <Divider style={{ borderColor: 'rgba(0,195,255,0.2)' }} />
                        <Link href='/admin' onClick={() => setSideMenuOpen(false)}>
                            <div
                                className='flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors'
                                style={{
                                    color: '#00c3ff',
                                    background: 'rgba(0,195,255,0.05)',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,195,255,0.1)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,195,255,0.05)')}
                            >
                                <AdminPanelSettings style={{ fontSize: 20, filter: 'drop-shadow(0 0 6px #00c3ff)' }} />
                                <div className='flex flex-col'>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', textShadow: '0 0 10px rgba(0,195,255,0.6)' }}>
                                        MEMBER PORTAL
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(0,195,255,0.5)', letterSpacing: '0.05em' }}>
                                        Admin access
                                    </span>
                                </div>
                            </div>
                        </Link>
                    </>
                )}

                <Divider style={{ borderColor: 'rgba(255,255,255,0.08)' }} />

                <div className='flex gap-2 p-3'>
                    <Link href='/donate' className='flex-1' onClick={() => setSideMenuOpen(false)}>
                        <Button variant='outlined' color='primary' fullWidth startIcon={<VolunteerActivism />} size='small'>Donate</Button>
                    </Link>
                    {user ? (
                        <>
                            <Link href='/me' onClick={() => setSideMenuOpen(false)}>
                                <div className='relative w-[36px] h-[36px]'><Avatar user={user} /></div>
                            </Link>
                        </>
                    ) : (
                        <Link href='/login' className='flex-1' onClick={() => setSideMenuOpen(false)}>
                            <Button variant='outlined' color='inherit' fullWidth startIcon={<Login />} size='small'
                                style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(237,237,237,0.7)' }}>
                                Login
                            </Button>
                        </Link>
                    )}
                </div>
            </Drawer>
        </>
    )
}


function MobileNavItem({ link, onClose }: { link: Link, onClose: () => void }) {
    const [expanded, setExpanded] = useState(false)

    if (!link.subLinks) return (
        <Link href={link.href as any} onClick={onClose}>
            <div className='flex items-center gap-3 px-3 py-[10px] rounded-md cursor-pointer transition-colors hover:bg-white/5'
                style={{ color: 'rgba(237,237,237,0.7)' }}>
                <span className='flex text-[20px]'>{link.icon}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.06em' }}>{link.name.toUpperCase()}</span>
            </div>
        </Link>
    )

    return (
        <div>
            <div
                className='flex items-center gap-3 px-3 py-[10px] rounded-md cursor-pointer transition-colors hover:bg-white/5'
                style={{
                    borderLeft: expanded ? '2px solid var(--red)' : '2px solid transparent',
                    color: expanded ? 'var(--foreground)' : 'rgba(237,237,237,0.7)',
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <span className='flex text-[20px]' style={{ color: expanded ? 'var(--red)' : 'inherit' }}>{link.icon}</span>
                <span className='flex-1' style={{ fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.06em' }}>{link.name.toUpperCase()}</span>
                {expanded ? <ExpandLess style={{ fontSize: 18, opacity: 0.5 }} /> : <ExpandMore style={{ fontSize: 18, opacity: 0.5 }} />}
            </div>

            <Collapse in={expanded}>
                <div className='pl-4 pb-1 flex flex-col gap-[2px]'>
                    {link.subLinks.map(sub => (
                        <Link key={sub.link} href={sub.link as any} onClick={onClose}>
                            <div className='flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors hover:bg-white/5'
                                style={{ color: 'rgba(237,237,237,0.6)' }}>
                                <span className='flex text-[18px]' style={{ color: 'rgba(219, 0, 29, 0.8)' }}>{sub.icon}</span>
                                <span style={{ fontSize: '0.82rem' }}>{sub.name}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </Collapse>
        </div>
    )
}


function ProfileDropdown({ user }: { user: User }) {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
    const [orbatEntry, setOrbatEntry] = React.useState<{ role: string; section: string } | null | undefined>(undefined)
    const [avatarHovered, setAvatarHovered] = React.useState(false)
    const open = Boolean(anchorEl)

    async function handleLogout() {
        await fetch('/api/logout', { method: 'POST' })
        window.location.href = '/'
    }

    const userRoles = (user as any).roles as Role[] | undefined
    const isAdmin = !!(user as any).isStaff

    const accent = user.hexAccentColor ? `#${user.hexAccentColor.replace('#', '')}` : '#DB001D'
    const strippedNickname = user.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const displayName = strippedNickname || user.globalName || user.username
    const parts = displayName.split(' ')
    const name = user.name || (parts.length > 1 ? parts.slice(1).join(' ') : displayName)
    const rankAbbr = user.milpac?.currentRank || null
    const rank = rankAbbr ? rankNameFromAbbr(rankAbbr) : null

    function handleOpen(e: React.MouseEvent<HTMLElement>) {
        setAnchorEl(e.currentTarget)
        if (orbatEntry === undefined) {
            fetch('/api/me/orbat')
                .then(r => r.json())
                .then(data => setOrbatEntry(data ?? null))
                .catch(() => setOrbatEntry(null))
        }
    }

    return (
        <>
            {/* Navbar avatar button — square with accent border */}
            <div
                className='flex-shrink-0'
                role='button'
                title={displayName}
                onClick={handleOpen}
                onMouseEnter={() => setAvatarHovered(true)}
                onMouseLeave={() => setAvatarHovered(false)}
                style={{
                    position: 'relative',
                    width: 38,
                    height: 38,
                    borderRadius: 6,
                    border: `1px solid ${accent}`,
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: avatarHovered ? `0 0 16px 4px ${accent}88` : `0 0 8px 0 ${accent}55`,
                    transition: 'box-shadow 0.2s',
                    cursor: 'pointer',
                }}
            >
                <Avatar user={user} borderRadius='4px' />
            </div>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={() => setAnchorEl(null)}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                slotProps={{
                    list: { style: { padding: 0 } },
                    paper: {
                        style: {
                            background: 'rgba(10,10,10,0.97)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            borderTop: `2px solid ${accent}`,
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 6,
                            minWidth: 210,
                            overflow: 'hidden',
                        }
                    }
                }}
            >
                {/* Mini profile header */}
                <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 6, border: `2px solid ${accent}`, overflow: 'hidden', flexShrink: 0, boxShadow: `0 0 10px 0 ${accent}44` }}>
                        <Avatar user={user} borderRadius='4px' />
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {name}
                        </div>
                        {rank && (
                            <div style={{ fontSize: '0.72rem', color: accent, fontWeight: 600, marginTop: 2, letterSpacing: '0.05em' }}>
                                {rank}
                            </div>
                        )}
                        <div style={{ fontSize: '0.70rem', color: 'rgba(237,237,237,0.4)', marginTop: 1 }}>
                            {orbatEntry === undefined
                                ? '...'
                                : orbatEntry
                                    ? orbatEntry.role
                                    : null}
                        </div>
                    </div>
                </div>

                {/* Menu items */}
                <div style={{ padding: '6px 8px' }}>
                    <Link href='/me'>
                        <MenuItem onClick={() => setAnchorEl(null)} style={{ gap: 10, borderRadius: 4, padding: '8px 10px' }}
                            sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' } }}>
                            <Person style={{ fontSize: 17, color: 'rgba(237,237,237,0.45)' }} />
                            <span style={{ fontSize: '0.80rem', fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.75)' }}>PROFILE</span>
                        </MenuItem>
                    </Link>
                    <Link href={`/milpacs/${user.username}`}>
                        <MenuItem onClick={() => setAnchorEl(null)} style={{ gap: 10, borderRadius: 4, padding: '8px 10px' }}
                            sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' } }}>
                            <MilitaryTech style={{ fontSize: 17, color: 'rgba(237,237,237,0.45)' }} />
                            <span style={{ fontSize: '0.80rem', fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.75)' }}>MY MILPAC</span>
                        </MenuItem>
                    </Link>
                    <Link href='/optionals'>
                        <MenuItem onClick={() => setAnchorEl(null)} style={{ gap: 10, borderRadius: 4, padding: '8px 10px' }}
                            sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' } }}>
                            <Tune style={{ fontSize: 17, color: 'rgba(237,237,237,0.45)' }} />
                            <span style={{ fontSize: '0.80rem', fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.75)' }}>OPTIONALS</span>
                        </MenuItem>
                    </Link>
                    {isAdmin && (
                        <>
                            <div style={{ borderTop: '1px solid rgba(0,195,255,0.15)', margin: '6px 0' }} />
                            <Link href='/admin'>
                                <MenuItem onClick={() => setAnchorEl(null)} style={{ gap: 10, borderRadius: 4, padding: '8px 10px', background: 'rgba(0,195,255,0.04)' }}
                                    sx={{ '&:hover': { backgroundColor: 'rgba(0,195,255,0.1) !important' } }}>
                                    <AdminPanelSettings style={{ fontSize: 17, color: '#00c3ff', filter: 'drop-shadow(0 0 4px #00c3ff)' }} />
                                    <span style={{ fontSize: '0.80rem', fontWeight: 600, letterSpacing: '0.06em', color: '#00c3ff', textShadow: '0 0 8px rgba(0,195,255,0.5)' }}>MEMBER PORTAL</span>
                                </MenuItem>
                            </Link>
                        </>
                    )}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '6px 0' }} />
                    <MenuItem
                        onClick={handleLogout}
                        style={{ gap: 10, borderRadius: 4, padding: '8px 10px' }}
                        sx={{ '&:hover': { backgroundColor: 'rgba(219,0,29,0.08)' } }}
                    >
                        <Logout style={{ fontSize: 17, color: 'rgba(219,0,29,0.6)' }} />
                        <span style={{ fontSize: '0.80rem', fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(219,0,29,0.7)' }}>LOGOUT</span>
                    </MenuItem>
                </div>
            </Menu>
        </>
    )
}


function DropDownMenu({ data, isActive }: { data: Link, isActive: boolean }) {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
    const open = Boolean(anchorEl)
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget)
    }
    const handleClose = () => {
        setAnchorEl(null)
    }

    const cols = (data.subLinks?.length ?? 0) > 3 ? 2 : 1

    return (
        <div>
            <Button
                id="basic-button"
                variant='text'
                color='light'
                aria-controls={open ? 'basic-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={open ? 'true' : undefined}
                startIcon={data.icon}
                endIcon={open ? <ArrowRight /> : <ArrowDropDown />}
                onClick={handleClick}
                style={{
                    borderBottom: isActive ? '2px solid var(--red)' : '2px solid transparent',
                    borderRadius: 0,
                    opacity: isActive ? 1 : 0.75,
                    transition: 'border-color 0.2s, opacity 0.2s',
                }}
            >
                {data.name}
            </Button>
            <Menu
                id="basic-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                slotProps={{
                    list: { 'aria-labelledby': 'basic-button', style: { padding: '8px' } },
                    paper: {
                        style: {
                            background: 'rgba(10,10,10,0.95)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            borderTop: '2px solid var(--red)',
                            border: '1px solid rgba(219, 0, 29, 0.25)',
                            borderRadius: 0,
                            minWidth: cols === 2 ? 520 : 280,
                        }
                    }
                }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '4px' }}>
                    {data.subLinks?.map(link => (
                        <Link key={link.link} href={link.link as any}>
                            <MenuItem
                                onClick={handleClose}
                                style={{ borderRadius: 4, padding: '10px 12px', alignItems: 'flex-start', gap: 12 }}
                                sx={{
                                    '&:hover': { backgroundColor: 'rgba(219, 0, 29, 0.08)' },
                                    '&:hover .sublink-icon': { borderColor: 'rgba(219, 0, 29, 0.6)', color: 'var(--red)' },
                                }}
                            >
                                <div
                                    className='sublink-icon'
                                    style={{
                                        flexShrink: 0,
                                        padding: 8,
                                        border: '1px solid rgba(219, 0, 29, 0.25)',
                                        background: 'rgba(219, 0, 29, 0.08)',
                                        color: 'rgba(237, 237, 237, 0.6)',
                                        display: 'flex',
                                        transition: 'border-color 0.2s, color 0.2s',
                                    }}
                                >
                                    {link.icon}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.08em', color: 'var(--foreground)' }}>
                                        {link.name.toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'rgba(237, 237, 237, 0.45)', marginTop: 2 }}>
                                        {link.description}
                                    </div>
                                </div>
                            </MenuItem>
                        </Link>
                    ))}
                </div>
            </Menu>
        </div>
    )
}
