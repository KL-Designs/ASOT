import Image from 'next/image'
import Link from 'next/link'

import { Typography } from '@mui/material'

import Logo from '@/public/ASOT-logo.png'
import MapBg from '@/public/designs/map.png'


const navColumns = [
    {
        heading: 'Unit',
        links: [
            { label: 'Home', href: '/' },
            { label: 'About Us', href: '/about' },
            { label: 'ORBAT', href: '/community/orbat' },
            { label: 'Biographies', href: '/community/bios' },
            { label: 'Hall of Fame', href: '/community/hof' },
        ],
    },
    {
        heading: 'Community',
        links: [
            { label: 'Gallery', href: '/gallery' },
            { label: 'Partners', href: '/partnerships' },
            { label: 'Support', href: '/support' },
            { label: 'Donate', href: '/donate' },
            { label: 'MILPACS', href: 'https://www.australianspecialoperationstaskforce.com/milpacs' },
        ],
    },
    {
        heading: 'About',
        links: [
            { label: 'Rules', href: '/about/rules' },
            { label: 'Principles & Values', href: '/about/values' },
            { label: 'FAQ', href: '/about/faq' },
            { label: 'Callsigns', href: '/about/callsigns' },
            { label: 'Contact', href: '/about/contact' },
        ],
    },
]


export default function Footer() {
    return (
        <footer
            style={{
                borderTop: '2px solid var(--red)',
                background: '#080808',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Map background */}
            <div className='absolute inset-0 pointer-events-none'>
                <Image src={MapBg} alt='' fill className='object-cover opacity-[0.06]' />
            </div>

            {/* Main content */}
            <div className='relative z-10 w-full max-w-6xl mx-auto px-6 md:px-10 py-12 flex flex-col gap-10'>

                {/* Top row */}
                <div className='flex flex-col md:flex-row gap-10 md:gap-6'>

                    {/* Brand column */}
                    <div className='flex flex-col gap-4 md:max-w-[260px] shrink-0'>
                        <Image src={Logo} alt='ASOT Logo' width={56} quality={100} />
                        <div>
                            <Typography
                                fontWeight={700}
                                letterSpacing={3}
                                fontSize='0.8rem'
                                style={{ textTransform: 'uppercase', color: 'var(--foreground)' }}
                            >
                                Australian Special Operations Taskforce
                            </Typography>
                            <Typography
                                fontSize='0.78rem'
                                style={{ color: 'rgba(237,237,237,0.35)', marginTop: 6, lineHeight: 1.6 }}
                            >
                                A milsim ArmA 3 community focused on teamwork, realism, and a great game experience.
                            </Typography>
                        </div>
                    </div>

                    {/* Spacer */}
                    <div className='hidden md:block flex-1' />

                    {/* Nav columns */}
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-8'>
                        {navColumns.map(col => (
                            <div key={col.heading} className='flex flex-col gap-3'>
                                <Typography
                                    fontSize='0.7rem'
                                    fontWeight={700}
                                    letterSpacing={3}
                                    style={{ textTransform: 'uppercase', color: 'var(--red)' }}
                                >
                                    {col.heading}
                                </Typography>
                                <div className='flex flex-col gap-[6px]'>
                                    {col.links.map(link => (
                                        <Link key={link.label} href={link.href}>
                                            <Typography
                                                fontSize='0.8rem'
                                                letterSpacing='0.04em'
                                                style={{
                                                    color: 'rgba(237,237,237,0.45)',
                                                    transition: 'color 0.15s',
                                                    cursor: 'pointer',
                                                }}
                                                className='hover:!text-[rgba(237,237,237,0.85)]'
                                            >
                                                {link.label}
                                            </Typography>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'linear-gradient(to right, rgba(219,0,29,0.4), rgba(255,255,255,0.06), transparent)' }} />

                {/* Bottom row */}
                <div className='flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center'>
                    <Typography fontSize='0.7rem' letterSpacing={1} style={{ color: 'rgba(237,237,237,0.2)', textTransform: 'uppercase' }}>
                        © {new Date().getFullYear()} Australian Special Operations Taskforce
                    </Typography>
                    <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.18)', maxWidth: 560, lineHeight: 1.6, textAlign: 'right' }}>
                        ARMA 2™ ARMA 3™ and Bohemia Interactive™ are trademarks of Bohemia Interactive. ASOT is an ArmA 3 online gaming community and is not affiliated with, associated with, or endorsed by the Australian Defence Force or the Australian Government.
                    </Typography>
                </div>

            </div>
        </footer>
    )
}
