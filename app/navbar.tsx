'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { useState, useEffect } from 'react'

import { Button, IconButton, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Menu, MenuItem } from '@mui/material'
import { Home, School, Group, MilitaryTech, Collections, Handshake, Support, VolunteerActivism, Login, Menu as MenuIcon, ArrowRight, ArrowDropDown } from '@mui/icons-material'

import Navigation from '@/styles/navigation.module.css'
import Avatar from '@/components/member/avatar'

import Logo from '@/public/logo.png'
import Honeycomb from '@/public/designs/honeycombs.svg'


type Link = ({
    name: string
    href: string
    icon: React.JSX.Element
    subLinks?: undefined
} | {
    name: string
    href: string
    icon: React.JSX.Element
    subLinks: {
        name: string
        link: string
    }[]
})



export default function Navbar() {

    const [sideMenuOpen, setSideMenuOpen] = useState(false)
    const [user, setUser] = useState<User | null>(null)

    const Links: Link[] = [
        { name: 'Home', href: '/', icon: <Home /> },
        {
            name: 'About Us', href: '/about', icon: <School />,
            subLinks: [
                { name: 'About Us', link: '/about' },
                { name: 'callsigns', link: '/about/callsigns' },
                { name: 'contact', link: '/about/contact' },
                { name: 'rules', link: '/about/rules' },
                { name: 'PRINCIPLES & VALUES', link: '/about/values' },
                { name: 'faq', link: '/about/faq' }
            ]
        },
        {
            name: 'ORBAT', href: '/orbat', icon: <Group />,
            subLinks: [
                { name: 'ORBAT', link: '/orbat' },
                { name: 'biographies', link: '/bios' },
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


    return (
        <>
            <div
                className='relative'
                style={{
                    width: '100%',
                    borderBottom: '1px solid var(--red)',
                    backgroundColor: 'var(--background)',
                }}
            >

                <div className='absolute w-full h-full'>
                    <Image src={Honeycomb} alt='honeycomb' fill className='object-cover opacity-10' />
                </div>

                <div className='flex flex-row justify-between gap-10 p-[15px] px-[30px]' style={{ zIndex: 1 }}>
                    <div className='min-w-[50px] self-center flex flex-row items-center gap-x-3'>
                        <Link href='/'>
                            <IconButton style={{ padding: 0 }}>
                                <Image src={Logo} width={50} quality={100} alt='Logo' />
                            </IconButton>
                        </Link>
                    </div>

                    <div className='hidden md:flex flex-row flex-wrap justify-end gap-x-10 gap-y-2 self-center'>
                        {Links.map((link) => {
                            if (!link.subLinks) return (
                                <Link key={link.name} href={link.href} target={/*link.target || */'_self'}>
                                    <Button startIcon={link.icon} color='light'>{link.name}</Button>
                                </Link>
                            )

                            else return <DropDownMenu key={link.name} data={link} />
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

            <Drawer open={sideMenuOpen} onClose={() => setSideMenuOpen(false)}>
                <div className='relative h-full flex flex-col gap-5' style={{
                    borderRight: '1px solid #db001d',
                    background: '#0a0a0a'
                }}>

                    <div className='absolute w-full h-full blur-[5px]'>
                        <Image src={Honeycomb} alt='honeycomb' fill className='object-cover opacity-40' />
                    </div>

                    <Link className='self-center pt-3' href='/'>
                        <IconButton style={{ padding: 0 }}>
                            <Image src={Logo} width={75} alt='Logo' />
                        </IconButton>
                    </Link>

                    <Divider color='#db001d' />

                    <List>
                        {Links.map((link, index) => (
                            <ListItem key={link.name} disablePadding>
                                <Link href={link.href}>
                                    <ListItemButton onClick={() => setSideMenuOpen(false)}>
                                        <div className='pl-3 pr-10 flex items-center'>
                                            <ListItemIcon>
                                                {link.icon}
                                            </ListItemIcon>
                                            <ListItemText primary={link.name} />
                                        </div>
                                    </ListItemButton>
                                </Link>
                            </ListItem>
                        ))}
                    </List>

                </div>
            </Drawer>
        </>
    )
}


function DropDownMenu({ data }: { data: Link }) {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
    const open = Boolean(anchorEl)
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget)
    };
    const handleClose = () => {
        setAnchorEl(null)
    }

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
            >
                {data.name}
            </Button>
            <Menu
                id="basic-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                slotProps={{
                    list: {
                        'aria-labelledby': 'basic-button',
                    },
                }}
            >
                {data.subLinks?.map(link => (<Link href={link.link}><MenuItem onClick={handleClose}>{link.name.toUpperCase()}</MenuItem></Link>))}
            </Menu>
        </div>
    )
}