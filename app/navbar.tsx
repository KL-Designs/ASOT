'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { useState, useEffect } from 'react'

import { Button, IconButton, Drawer, Divider, Menu, MenuItem, Collapse } from '@mui/material'
import { Home, School, Group, MilitaryTech, Collections, Handshake, Support, VolunteerActivism, Login, Menu as MenuIcon, ArrowRight, ArrowDropDown, InfoOutlined, Tag, ContactMail, Gavel, AutoAwesome, HelpOutline, AccountTree, Badge, Close, ExpandMore, ExpandLess, EmojiEvents } from '@mui/icons-material'

import Navigation from '@/styles/navigation.module.css'
import Avatar from '@/components/member/avatar'

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
            name: 'Community', href: '/community', icon: <Group />,
            subLinks: [
                { name: 'ORBAT', link: '/community/orbat', icon: <AccountTree />, description: 'Full order of battle' },
                { name: 'Biographies', link: '/community/bios', icon: <Badge />, description: 'Member biographies' },
                { name: 'Hall of Fame', link: '/community/hof', icon: <EmojiEvents />, description: 'Honoured unit members' },
            ]
        },
        { name: 'MILPACS', href: 'https://www.australianspecialoperationstaskforce.com/milpacs', icon: <MilitaryTech /> },
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
                    borderBottom: '1px solid rgba(219,0,29,0.4)',
                    backgroundColor: scrolled ? 'rgba(10,10,10,0.82)' : 'var(--background)',
                    backdropFilter: scrolled ? 'blur(16px)' : 'none',
                    WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
                    transition: 'background-color 0.3s ease, backdrop-filter 0.3s ease',
                }}
            >

                <div className='absolute w-full h-full' style={{ top: 0, left: 0 }}>
                    <Image src={MapBg} alt='map' fill className='object-cover opacity-15' />
                </div>

                <div className='flex flex-row justify-between gap-10 px-[30px]' style={{ zIndex: 1, padding: scrolled ? '10px 30px' : '15px 30px', transition: 'padding 0.3s ease' }}>
                    <div className='min-w-[50px] self-center flex flex-row items-center gap-x-3'>
                        <Link href='/'>
                            <IconButton style={{ padding: 0 }}>
                                <Image src={Logo} width={scrolled ? 40 : 50} quality={100} alt='Logo' style={{ transition: 'width 0.3s ease' }} />
                            </IconButton>
                        </Link>
                    </div>

                    <div className='hidden md:flex flex-row flex-wrap justify-end gap-x-10 gap-y-2 self-center'>
                        {Links.map((link) => {
                            if (!link.subLinks) {
                                const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
                                return (
                                    <Link key={link.name} href={link.href} target='_self'>
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

                        {user ?
                            <Link href='/me' title={user.globalName || user.username}>
                                <div className='relative w-[40px] h-[40px]'>
                                    <Avatar user={user} />
                                </div>
                            </Link>
                            :
                            <Link href='/login' title='Login'>
                                <div className={Navigation['nav-button']}>
                                    <Login />
                                </div>
                            </Link>
                        }

                        <div className={Navigation['nav-button'] + ' visible md:hidden'} onClick={() => setSideMenuOpen(true)}>
                            <MenuIcon />
                        </div>
                    </div>
                </div>

            </div>

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

                <Divider style={{ borderColor: 'rgba(255,255,255,0.08)' }} />

                <div className='flex gap-2 p-3'>
                    <Link href='/donate' className='flex-1' onClick={() => setSideMenuOpen(false)}>
                        <Button variant='outlined' color='primary' fullWidth startIcon={<VolunteerActivism />} size='small'>Donate</Button>
                    </Link>
                    {user ?
                        <Link href='/me' onClick={() => setSideMenuOpen(false)}>
                            <div className='relative w-[36px] h-[36px]'><Avatar user={user} /></div>
                        </Link>
                        :
                        <Link href='/login' className='flex-1' onClick={() => setSideMenuOpen(false)}>
                            <Button variant='outlined' color='inherit' fullWidth startIcon={<Login />} size='small'
                                style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(237,237,237,0.7)' }}>
                                Login
                            </Button>
                        </Link>
                    }
                </div>
            </Drawer>
        </>
    )
}


function MobileNavItem({ link, onClose }: { link: Link, onClose: () => void }) {
    const [expanded, setExpanded] = useState(false)

    if (!link.subLinks) return (
        <Link href={link.href} onClick={onClose}>
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
                        <Link key={sub.link} href={sub.link} onClick={onClose}>
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
                        <Link key={link.link} href={link.link}>
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
