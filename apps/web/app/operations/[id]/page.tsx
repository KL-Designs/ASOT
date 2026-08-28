import Db from '@/lib/mongo'
import dayjs from 'dayjs'
import Link from 'next/link'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import DocBody from './doc-body'
import SectionNav from './section-nav'
import PagedView from './paged-view'
import PageNavClient from './PageNavClient'
import LocalDate from './local-date'
import PrintButton from './print-button'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import AttendanceDrawer from '@/components/operations/AttendanceDrawer'
import AttendanceBoard from '@/components/operations/board/AttendanceBoard'
import ZeusNotesPanel from './ZeusNotesPanel'
import OperationStatusBar from '@/components/operations/OperationStatusBar'
import OcapLinkPanel from './OcapLinkPanel'
import OcapStatsPanel from './OcapStatsPanel'
import DocAcknowledgeCard from './DocAcknowledgeCard'
import OperationBar from './OperationBar'


function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
    const { id } = await params
    const sp = searchParams ? await searchParams : {}
    const activePageParam = typeof sp?.page === 'string' ? sp.page : undefined
    const fromJ2 = sp?.from === 'j2'
    await connection()

    const [operation, me] = await Promise.all([
        Db.operations.findOne({ _id: new ObjectId(id) }),
        client.fetchMe().catch(() => null),
    ])
    const isLoggedIn = !!me
    const isHQ = me ? client.hasRoles(me, PERMISSIONS.pages.operationsEdit) : false
    const isAllStaff = me ? await hasPermission(me, 'attendance.confirm') : false
    // See PERMISSIONS.attendance.manage — three-armed for the same reason the
    // write route is: `hasPermission` has no Discord-role fallback and does not
    // honour the J4 bypass, and the legacy ORBAT key must keep working.
    const canManageAttendance = me
        ? (await hasPermission(me, 'attendance.manage'))
            || client.hasRoles(me, PERMISSIONS.attendance.manage)
            || client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
        : false
    const isJ6 = me ? client.hasRoles(me, PERMISSIONS.departments.j6) : false

    // Check if the logged-in user is a section leader (isSenior on their ORBAT position)
    const isSectionLeader = me
        ? !!(await Db.orbatPositions.findOne({ userId: me.id, isSenior: true }))
        : false

    const showAcknowledgeCard = isAllStaff && operation?.status === 'Upcoming'

    if (!operation) return (
        <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Operation not found
        </div>
    )

    const { r, g, b } = hexToRgb(operation.themeColor || '#db001d')
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    const hasCover = !!operation.coverImage
    const hasHiddenSections = !isLoggedIn && (
        (operation.sections?.some(s => !s.isPublic) ?? false) ||
        Object.values(operation.extraPageSections ?? {}).some(secs => secs.some(s => !s.isPublic))
    )

    const pageTheme = (operation.pageTheme || 'modern') as 'modern' | 'oldfashioned' | 'scifi'
    const isOF = pageTheme === 'oldfashioned'
    const isSF = pageTheme === 'scifi'
    const isModern = pageTheme === 'modern'

    const sfStars = isSF ? [
        `radial-gradient(ellipse 70% 50% at 10% 70%, ${c(0.04)} 0%, transparent 60%)`,
        `radial-gradient(ellipse 50% 40% at 88% 20%, ${c(0.035)} 0%, transparent 60%)`,
        `radial-gradient(ellipse 80% 30% at 50% 98%, rgba(20,40,80,0.08) 0%, transparent 60%)`,
        ...[
            ['2%', '4%', '1px', '0.55'], ['8%', '12%', '1px', '0.35'], ['15%', '2%', '2px', '0.65'], ['22%', '18%', '1px', '0.4'],
            ['31%', '7%', '1px', '0.3'], ['38%', '22%', '1px', '0.45'], ['45%', '5%', '2px', '0.6'], ['52%', '15%', '1px', '0.35'],
            ['60%', '3%', '1px', '0.5'], ['68%', '20%', '1px', '0.3'], ['75%', '10%', '2px', '0.7'], ['83%', '6%', '1px', '0.4'],
            ['90%', '16%', '1px', '0.35'], ['95%', '3%', '1px', '0.55'], ['4%', '28%', '1px', '0.3'], ['11%', '35%', '1px', '0.45'],
            ['19%', '42%', '2px', '0.6'], ['27%', '31%', '1px', '0.35'], ['35%', '48%', '1px', '0.4'], ['43%', '37%', '1px', '0.3'],
            ['50%', '25%', '1px', '0.55'], ['58%', '40%', '1px', '0.35'], ['65%', '33%', '2px', '0.65'], ['72%', '45%', '1px', '0.4'],
            ['80%', '28%', '1px', '0.3'], ['88%', '38%', '1px', '0.5'], ['93%', '47%', '1px', '0.35'], ['6%', '55%', '1px', '0.4'],
            ['14%', '62%', '2px', '0.6'], ['21%', '70%', '1px', '0.3'], ['29%', '58%', '1px', '0.45'], ['36%', '75%', '1px', '0.35'],
            ['44%', '63%', '1px', '0.5'], ['51%', '52%', '1px', '0.3'], ['59%', '68%', '2px', '0.7'], ['66%', '60%', '1px', '0.4'],
            ['74%', '72%', '1px', '0.35'], ['81%', '55%', '1px', '0.45'], ['89%', '65%', '1px', '0.3'], ['97%', '58%', '1px', '0.55'],
            ['3%', '82%', '1px', '0.35'], ['10%', '88%', '1px', '0.4'], ['17%', '78%', '2px', '0.6'], ['25%', '92%', '1px', '0.3'],
            ['33%', '83%', '1px', '0.45'], ['40%', '96%', '1px', '0.35'], ['48%', '85%', '1px', '0.5'], ['55%', '79%', '1px', '0.3'],
            ['62%', '90%', '2px', '0.65'], ['70%', '84%', '1px', '0.4'], ['77%', '95%', '1px', '0.35'], ['85%', '80%', '1px', '0.5'],
            ['92%', '92%', '1px', '0.3'], ['7%', '15%', '1px', '0.45'], ['18%', '55%', '1px', '0.35'], ['28%', '78%', '2px', '0.6'],
            ['47%', '42%', '1px', '0.4'], ['63%', '25%', '1px', '0.35'], ['79%', '67%', '1px', '0.5'], ['94%', '38%', '1px', '0.3'],
        ].map(([x, y, s, o]) => `radial-gradient(${s} ${s} at ${x} ${y}, rgba(255,255,255,${o}) 0%, transparent 100%)`),
    ].join(',') : ''

    return (
        <div
            className='flex flex-col min-h-full'
            style={isOF ? { background: '#140f07' } : isSF ? { backgroundColor: '#01050a', backgroundImage: sfStars, backgroundAttachment: 'fixed' } : undefined}
        >
            {/*
                The operation's view strip. This page is the Orders view — the
                one anybody can read — and the same four names appear here as in
                the editor, so moving between them is one bar rather than two
                different chromes. The slim bar deliberately carries none of the
                editor's authoring controls; the ribbon under Orders is the only
                way into `/edit`, and only for people who can use it.
            */}
            <OperationBar
                operationId={id}
                title={operation.title}
                status={operation.status}
                themeColor={operation.themeColor}
                active='orders'
                canEdit={isHQ}
                fromJ2={fromJ2}
            />

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <div style={{ position: 'relative', overflow: 'hidden', paddingBottom: 1 }}>

                {/* Cover photo */}
                {hasCover && (
                    <img
                        src={operation.coverImage}
                        alt=''
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', zIndex: 0 }}
                    />
                )}

                {/* Dark overlay when cover is present */}
                {hasCover && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 1,
                        background: isOF
                            ? `linear-gradient(to bottom, rgba(20,13,5,0.45) 0%, rgba(20,13,5,0.25) 55%, rgba(20,15,7,1) 100%)`
                            : isSF
                                ? `linear-gradient(to bottom, rgba(0,4,14,0.6) 0%, rgba(0,4,14,0.3) 55%, rgba(1,5,10,1) 100%)`
                                : `linear-gradient(to bottom, rgba(10,10,10,0.65) 0%, rgba(10,10,10,0.45) 55%, rgba(10,10,10,1) 100%)`,
                    }} />
                )}

                {/* Tactical grid / ruled lines */}
                <div style={isOF ? {
                    position: 'absolute', inset: 0, zIndex: 2,
                    backgroundImage: `repeating-linear-gradient(to bottom, rgba(160,120,50,0.07) 0px, rgba(160,120,50,0.07) 1px, transparent 1px, transparent 28px)`,
                } : isSF ? {
                    position: 'absolute', inset: 0, zIndex: 2,
                    backgroundImage: `linear-gradient(${c(hasCover ? 0.06 : 0.1)} 1px, transparent 1px), linear-gradient(90deg, ${c(hasCover ? 0.06 : 0.1)} 1px, transparent 1px)`,
                    backgroundSize: '28px 28px',
                    boxShadow: `inset 0 0 80px ${c(0.06)}`,
                } : {
                    position: 'absolute', inset: 0, zIndex: 2,
                    backgroundImage: `linear-gradient(${c(hasCover ? 0.03 : 0.045)} 1px, transparent 1px), linear-gradient(90deg, ${c(hasCover ? 0.03 : 0.045)} 1px, transparent 1px)`,
                    backgroundSize: '48px 48px',
                }} />

                {/* Radial glow — modern only when no cover */}
                {!hasCover && isModern && (
                    <div style={{
                        position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
                        width: '80%', height: '200%',
                        background: `radial-gradient(ellipse at 50% 40%, ${c(0.18)} 0%, ${c(0.06)} 35%, transparent 70%)`,
                        zIndex: 2, pointerEvents: 'none',
                    }} />
                )}

                {/* Sci-fi radial glow — always shown, dimmer with cover */}
                {isSF && (
                    <div style={{
                        position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
                        width: '70%', height: '180%',
                        background: `radial-gradient(ellipse at 50% 40%, ${c(hasCover ? 0.07 : 0.14)} 0%, ${c(hasCover ? 0.03 : 0.05)} 40%, transparent 70%)`,
                        zIndex: 2, pointerEvents: 'none',
                        filter: `blur(2px)`,
                    }} />
                )}

                {/* Sci-fi distant planet orb */}
                {isSF && !hasCover && (
                    <div style={{
                        position: 'absolute', top: '8%', right: '8%',
                        width: 140, height: 140, borderRadius: '50%',
                        background: `radial-gradient(circle at 35% 35%, rgba(${r},${g},${b},0.12) 0%, rgba(${r},${g},${b},0.04) 45%, transparent 70%)`,
                        boxShadow: `0 0 40px rgba(${r},${g},${b},0.08), 0 0 80px rgba(${r},${g},${b},0.04)`,
                        filter: 'blur(6px)',
                        zIndex: 2, pointerEvents: 'none',
                    }} />
                )}

                {/* Corner accents — top left */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: 80, height: 80, zIndex: 3, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 50, height: isOF ? 3 : 2, background: isOF ? 'rgba(160,120,50,0.65)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: isOF ? 3 : 2, height: 50, background: isOF ? 'rgba(160,120,50,0.65)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
                </div>
                {/* Corner accents — top right */}
                <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, zIndex: 3, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 50, height: isOF ? 3 : 2, background: isOF ? 'rgba(160,120,50,0.65)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, width: isOF ? 3 : 2, height: 50, background: isOF ? 'rgba(160,120,50,0.65)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
                </div>

                <div
                    className='flex flex-col items-center px-8 text-center'
                    style={{ position: 'relative', zIndex: 4, maxWidth: 960, margin: '0 auto', width: '100%', paddingTop: hasCover ? '7rem' : '4rem', paddingBottom: hasCover ? '8rem' : '5rem' }}
                >
                    {/* Back nav + edit */}
                    <div className='print-hide' style={{ position: 'absolute', top: 20, left: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link
                            href={fromJ2 ? '/dashboard/j2' : '/operations'}
                            style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: isOF ? 'rgba(180,145,60,0.45)' : 'rgba(237,237,237,0.28)', textDecoration: 'none' }}
                        >
                            {fromJ2 ? '← J2 Operations' : '← Operations'}
                        </Link>
                        {isHQ && (
                            <>
                                <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
                                <Link
                                    href={`/operations/${id}/edit`}
                                    style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.55), textDecoration: 'none' }}
                                >
                                    Edit
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Export PDF */}
                    <div style={{ position: 'absolute', top: 20, right: 0 }}>
                        <PrintButton bgColor={isOF ? '#140f07' : isSF ? '#01050a' : 'rgb(10,10,10)'} />
                    </div>

                    {/* Department badge */}
                    <div style={isOF ? {
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        border: '1px solid rgba(160,120,50,0.4)',
                        padding: '5px 20px',
                        marginBottom: 28,
                        background: 'rgba(160,120,50,0.08)',
                        letterSpacing: '0.04em',
                    } : isSF ? {
                        display: 'inline-flex', alignItems: 'center', gap: 10,
                        border: `1px solid ${c(0.55)}`,
                        padding: '4px 16px',
                        marginBottom: 28,
                        background: c(0.06),
                        boxShadow: `0 0 12px ${c(0.15)}, inset 0 0 12px ${c(0.04)}`,
                    } : {
                        display: 'inline-flex', alignItems: 'center', gap: 10,
                        border: `1px solid ${c(0.35)}`,
                        padding: '4px 16px',
                        marginBottom: 28,
                        background: c(0.07),
                    }}>
                        <span style={isOF ? {
                            width: 6, height: 6, background: 'rgba(160,120,50,0.75)', borderRadius: 0, display: 'inline-block', flexShrink: 0,
                        } : isSF ? {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                            boxShadow: `0 0 4px rgba(${r},${g},${b},1)`,
                        } : {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={isOF ? {
                            fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c8a850', fontFamily: '"Courier New", monospace',
                        } : isSF ? {
                            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: c(0.9),
                            textShadow: `0 0 6px rgba(${r},${g},${b},0.7)`,
                        } : {
                            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: c(0.9),
                        }}>
                            {operation.department || 'Joint Operation'}
                        </span>
                        <span style={isOF ? {
                            width: 6, height: 6, background: 'rgba(160,120,50,0.75)', borderRadius: 0, display: 'inline-block', flexShrink: 0,
                        } : isSF ? {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                            boxShadow: `0 0 4px rgba(${r},${g},${b},1)`,
                        } : {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                        }} />
                    </div>

                    {/* Title */}
                    <h1 style={isOF ? {
                        fontSize: 'clamp(1.8rem, 5vw, 3.2rem)',
                        fontWeight: 700,
                        fontFamily: '"Courier New", Courier, monospace',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        margin: '0 0 8px',
                        lineHeight: 1.15,
                        color: '#d4b870',
                        textAlign: 'center',
                    } : isSF ? {
                        fontSize: 'clamp(1.8rem, 5vw, 3.4rem)',
                        fontWeight: 900,
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                        fontFamily: '"Courier New", Courier, monospace',
                        margin: '0 0 8px',
                        lineHeight: 1.08,
                        color: c(1),
                        textAlign: 'center',
                        textShadow: `0 0 30px ${c(0.7)}, 0 0 60px ${c(0.4)}, 0 0 100px ${c(0.2)}`,
                    } : {
                        fontSize: 'clamp(2rem, 6vw, 3.8rem)',
                        fontWeight: 900,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        margin: '0 0 8px',
                        lineHeight: 1.08,
                        background: 'linear-gradient(175deg, #ffffff 20%, rgba(237,237,237,0.55) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        filter: `drop-shadow(0 0 50px ${c(0.55)}) drop-shadow(0 0 8px ${c(0.3)})`,
                        textAlign: 'center',
                    }}>
                        {operation.title}
                    </h1>

                    {/* Decorative rule */}
                    {isOF ? (
                        <div style={{ width: '100%', maxWidth: 480, margin: '20px auto 28px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ height: 2, background: 'rgba(160,120,50,0.4)' }} />
                            <div style={{ height: 1, background: 'rgba(160,120,50,0.2)' }} />
                        </div>
                    ) : isSF ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', maxWidth: 480, margin: '20px auto 28px' }}>
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${c(0.5)})`, boxShadow: `0 0 4px ${c(0.3)}` }} />
                            <div style={{ display: 'flex', gap: 3 }}>
                                {[...Array(3)].map((_, i) => <div key={i} style={{ width: 4, height: 4, background: c(0.7), boxShadow: `0 0 4px ${c(0.8)}` }} />)}
                            </div>
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${c(0.5)})`, boxShadow: `0 0 4px ${c(0.3)}` }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 480, margin: '20px auto 28px' }}>
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${c(0.4)})` }} />
                            <div style={{ width: 5, height: 5, border: `1px solid ${c(0.6)}`, transform: 'rotate(45deg)', flexShrink: 0 }} />
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${c(0.4)})` }} />
                        </div>
                    )}

                    {/* Meta row */}
                    <div style={isOF ? {
                        display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center',
                        border: '1px solid rgba(160,120,50,0.3)',
                        background: 'rgba(0,0,0,0.5)',
                    } : isSF ? {
                        display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center',
                        border: `1px solid ${c(0.35)}`,
                        background: 'rgba(0,8,16,0.7)',
                        boxShadow: `0 0 16px ${c(0.1)}, inset 0 0 20px ${c(0.03)}`,
                    } : {
                        display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center',
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(0,0,0,0.45)',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px', borderRight: operation.loreDate ? (isOF ? '1px solid rgba(160,120,50,0.2)' : isSF ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.06)') : undefined }}>
                            <span style={isOF ? {
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(180,145,60,0.4)', fontFamily: '"Courier New", monospace',
                            } : isSF ? {
                                fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: c(0.55), fontFamily: '"Courier New", monospace',
                            } : {
                                fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)',
                            }}>Operation Date</span>
                            <span style={isOF ? {
                                fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', color: '#c8a850', fontFamily: '"Courier New", monospace',
                            } : isSF ? {
                                fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: c(1), textShadow: `0 0 6px rgba(${r},${g},${b},0.5)`, fontFamily: '"Courier New", monospace',
                            } : {
                                fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.8)',
                            }}>
                                <LocalDate iso={operation.date?.toString() ?? ''} />
                            </span>
                        </div>
                        {operation.loreDate && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px' }}>
                                <span style={isOF ? {
                                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(180,145,60,0.4)', fontFamily: '"Courier New", monospace',
                                } : isSF ? {
                                    fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: c(0.55), fontFamily: '"Courier New", monospace',
                                } : {
                                    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)',
                                }}>In-Game Date</span>
                                <span style={isOF ? {
                                    fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', color: c(1), fontFamily: '"Courier New", monospace',
                                } : isSF ? {
                                    fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: c(1), textShadow: `0 0 6px rgba(${r},${g},${b},0.6)`, fontFamily: '"Courier New", monospace',
                                } : {
                                    fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: c(0.85),
                                }}>
                                    {operation.loreDate instanceof Date
                                        ? operation.loreDate.toLocaleDateString()
                                        : String(operation.loreDate)}
                                </span>
                            </div>
                        )}
                    </div>

                </div>

                {/* Bottom fade */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: isOF ? 'linear-gradient(to bottom, transparent, #140f07)' : isSF ? 'linear-gradient(to bottom, transparent, #01050a)' : 'linear-gradient(to bottom, transparent, var(--background))', zIndex: 5, pointerEvents: 'none' }} />
            </div>

            {/* ── Section nav (single-page only, no zeus/ocap tabs available) ─── */}
            {(!operation.pages || operation.pages.length <= 1) && !isJ6 && !operation.ocap && operation.sections && operation.sections.length > 1 && (
                <SectionNav
                    className='print-hide'
                    themeColor={operation.themeColor || '#db001d'}
                    pageTheme={pageTheme}
                    sections={operation.sections
                        .filter(s => isLoggedIn || s.isPublic)
                        .map(s => ({ id: s.id, title: s.title }))}
                />
            )}

            {/* ── Content + attendance sidebar ──────────────────────────────── */}
            <div className='w-full max-w-[2400px] mx-auto px-4 md:px-8 pb-16' style={{ marginTop: 32, display: 'flex', gap: 24, alignItems: 'flex-start' }}>

                {/* Left: document content */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 0, alignItems: 'flex-start' }}>

                    {/* Left page nav — shown for multi-page OR single-page with Zeus/OCAP tabs */}
                    {(() => {
                        // Zeus/OCAP are always added as hardcoded items below — exclude them from the pages array.
                        // Also deduplicate by id in case of stale Yjs race-condition data in MongoDB.
                        const _seenIds = new Set<string>()
                        const contentPages = (operation.pages ?? []).filter(pg => {
                            if (pg.pageType === 'zeus' || pg.pageType === 'ocap') return false
                            if (_seenIds.has(pg.id)) return false
                            _seenIds.add(pg.id)
                            return true
                        })
                        const isSinglePage = contentPages.length <= 1
                        const hasZeus = isJ6
                        const hasOcap = !!(isHQ || (isLoggedIn && operation.ocap))
                        const showPageNav = !isSinglePage || hasZeus || hasOcap
                        if (!showPageNav) return null

                        // Build nav items
                        type NavItem = { id: string; title: string; color?: string; isSeparator?: boolean }
                        const navItems: NavItem[] = []

                        if (!isSinglePage) {
                            for (const pg of contentPages) {
                                let color: string | undefined
                                if (pg.pageType === 'intel') {
                                    color = 'rgba(245,158,11,0.8)'
                                } else if (pg.pageType === 'orders') {
                                    color = `rgba(${r},${g},${b},0.8)`
                                } else if (pg.pageColor) {
                                    const hx = pg.pageColor.replace('#', '')
                                    const cr = parseInt(hx.slice(0,2),16), cg = parseInt(hx.slice(2,4),16), cb = parseInt(hx.slice(4,6),16)
                                    color = `rgba(${cr},${cg},${cb},0.8)`
                                }
                                navItems.push({ id: pg.id, title: pg.title, color })
                            }
                        } else {
                            // Single page — add the main page as the first item
                            navItems.push({ id: 'main', title: 'Operation Orders', color: `rgba(${r},${g},${b},0.8)` })
                        }

                        if (hasZeus) {
                            navItems.push({ id: '__sep_zeus__', title: '', isSeparator: true, color: 'rgba(0,195,255,0.8)' })
                            navItems.push({ id: '__zeus__', title: 'Zeus Notes', color: 'rgba(0,195,255,0.8)' })
                        }

                        if (hasOcap) {
                            navItems.push({ id: '__sep_ocap__', title: '', isSeparator: true, color: 'rgba(16,185,129,0.8)' })
                            navItems.push({ id: '__ocap__', title: 'OCAP', color: 'rgba(16,185,129,0.8)' })
                        }

                        // Determine active page for nav
                        const validIds = navItems.filter(i => !i.isSeparator).map(i => i.id)
                        const activePage = activePageParam && validIds.includes(activePageParam)
                            ? activePageParam
                            : (isSinglePage ? 'main' : (contentPages[0]?.id ?? 'main'))

                        return (
                            <PageNavClient
                                items={navItems}
                                activePage={activePage}
                                themeColor={operation.themeColor || '#db001d'}
                                pageTheme={pageTheme}
                                r={r} g={g} b={b}
                            />
                        )
                    })()}

                    {/* Main content area */}
                    <div style={{ flex: 1, minWidth: 0 }}>

                    {/* Op status / automation timeline bar */}
                    <OperationStatusBar
                        operationId={id}
                        operationDate={operation.date?.toString() ?? null}
                        operationStatus={operation.status ?? ''}
                        themeColor={operation.themeColor || '#db001d'}
                        r={r} g={g} b={b}
                    />

                    {/* OCAP viewer button — shown when a recording has been linked (only on main/non-ocap tab) */}
                    {operation.ocap && activePageParam !== '__ocap__' && (
                        <a
                            href={operation.ocap.viewerUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='print-hide'
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '7px 16px', textDecoration: 'none', marginTop: 16, marginBottom: 16,
                                border: `1px solid ${c(0.35)}`,
                                background: c(0.07),
                                color: c(0.85),
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                            }}
                        >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c(1), flexShrink: 0, boxShadow: `0 0 5px ${c(0.9)}` }} />
                            OCAP Recording ↗
                            <span style={{ opacity: 0.45, fontWeight: 400 }}>
                                {operation.ocap.missionName}
                            </span>
                        </a>
                    )}

                    {/* Multi-page view */}
                    {operation.pages && operation.pages.length > 1 && (
                        <PagedView
                            pages={operation.pages}
                            sectionsByPage={{ main: operation.sections ?? [], ...(operation.extraPageSections ?? {}) }}
                            operationTitle={operation.title}
                            themeColor={operation.themeColor || '#db001d'}
                            pageTheme={pageTheme}
                            isLoggedIn={isLoggedIn}
                            isJ6={isJ6}
                            isHQ={isHQ}
                            isAllStaff={isAllStaff}
                            showAcknowledgeCard={showAcknowledgeCard}
                            operationId={id}
                            zeusNotes={operation.zeusNotes ?? ''}
                            ocap={isLoggedIn && operation.ocap?.playerStats?.length ? operation.ocap : null}
                            initialOcap={isHQ ? (operation.ocap ?? null) : null}
                            r={r} g={g} b={b}
                            initialPageId={activePageParam}
                        />
                    )}

                    {/* Single-page sections */}
                    {(!operation.pages || operation.pages.length <= 1) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* Zeus Notes tab — J6 only */}
                            {isJ6 && activePageParam === '__zeus__' && (
                                <ZeusNotesPanel operationId={id} initialNotes={operation.zeusNotes ?? ''} />
                            )}

                            {/* OCAP tab */}
                            {activePageParam === '__ocap__' && (isHQ || (isLoggedIn && operation.ocap)) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {isHQ && (
                                        <OcapLinkPanel operationId={id} initialOcap={operation.ocap ?? null} />
                                    )}
                                    {isLoggedIn && operation.ocap && operation.ocap.playerStats?.length > 0 && (
                                        <OcapStatsPanel
                                            ocap={operation.ocap}
                                            themeColor={operation.themeColor || '#db001d'}
                                            r={r} g={g} b={b}
                                            pageTheme={pageTheme}
                                            operationId={id}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Main content — shown when not on a special tab */}
                            {activePageParam !== '__zeus__' && activePageParam !== '__ocap__' && (
                                <>

                            {/* Acknowledge banner — top of content area, static */}
                            {showAcknowledgeCard && (
                                <div className='print-hide' style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px', background: 'rgba(219,160,0,0.07)', borderTop: '2px solid rgba(219,160,0,0.45)', borderBottom: '1px solid rgba(219,160,0,0.14)', marginBottom: 4 }}>
                                    <div style={{ width: 6, height: 6, background: 'rgba(219,160,0,0.85)', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.8)' }}>
                                        Orders Acknowledgement Required — Scroll to Bottom to Acknowledge
                                    </span>
                                </div>
                            )}

                            {operation.sections && operation.sections.length > 0 ? (
                                operation.sections
                                    .filter(s => isLoggedIn || s.isPublic)
                                    .map(s => (
                                        <div key={s.id} id={`section-${s.id}`} data-print-section style={isOF ? {
                                            position: 'relative',
                                            border: '1px solid rgba(160,120,50,0.25)',
                                            borderTop: `2px solid ${c(0.8)}`,
                                            background: '#1d1408',
                                        } : isSF ? {
                                            position: 'relative',
                                            border: `1px solid ${c(0.3)}`,
                                            borderTop: `2px solid ${c(0.8)}`,
                                            background: 'rgba(0,4,14,0.82)',
                                            boxShadow: `0 0 20px ${c(0.1)}, inset 0 0 30px ${c(0.03)}`,
                                        } : {
                                            position: 'relative',
                                            border: `1px solid ${c(0.18)}`,
                                            borderTop: `2px solid ${c(0.6)}`,
                                        }}>

                                            {/* Sci-fi scan lines */}
                                            {isSF && (
                                                <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: `repeating-linear-gradient(to bottom, ${c(0.02)} 0px, ${c(0.02)} 1px, transparent 1px, transparent 4px)` }} />
                                            )}

                                            {/* Corner ticks — hidden in oldfashioned */}
                                            {!isOF && (
                                                <>
                                                    <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                                                        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                                        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                                    </div>
                                                    <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', zIndex: 1 }}>
                                                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                                    </div>
                                                </>
                                            )}

                                            {/* Section header */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                                                padding: '8px 20px',
                                                borderBottom: isOF ? '1px solid rgba(160,120,50,0.15)' : isSF ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.06)',
                                                background: isOF ? 'rgba(0,0,0,0.55)' : isSF ? c(0.06) : 'rgba(0,0,0,0.4)',
                                                ...(isSF ? { boxShadow: `inset 0 0 20px rgba(${r},${g},${b},0.05)` } : {}),
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={isOF ? {
                                                        width: 8, height: 8, background: c(1), flexShrink: 0, borderRadius: 0,
                                                    } : isSF ? {
                                                        width: 6, height: 6, background: c(0.8), flexShrink: 0, boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)`,
                                                    } : {
                                                        width: 6, height: 6, background: c(0.7), flexShrink: 0,
                                                    }} />
                                                    <span style={isOF ? {
                                                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8a850', fontFamily: '"Courier New", monospace',
                                                    } : isSF ? {
                                                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.9), textShadow: `0 0 6px rgba(${r},${g},${b},0.5)`, fontFamily: '"Courier New", monospace',
                                                    } : {
                                                        fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8),
                                                    }}>
                                                        {s.title}
                                                    </span>
                                                </div>
                                                {isLoggedIn && !s.isPublic && (
                                                    <span style={isOF ? {
                                                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,160,50,0.75)', border: '1px solid rgba(160,120,50,0.35)', padding: '1px 8px', fontFamily: '"Courier New", monospace',
                                                    } : {
                                                        fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,180,0,0.6)', border: '1px solid rgba(219,180,0,0.25)', padding: '1px 6px',
                                                    }}>
                                                        Classified
                                                    </span>
                                                )}
                                            </div>

                                            {/* Body */}
                                            <div style={{ padding: '0 28px' }}>
                                                <DocBody content={s.content ?? null} themeColor={operation.themeColor || '#db001d'} pageTheme={pageTheme} />
                                            </div>

                                            {/* Footer stamp */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '7px 20px',
                                                borderTop: isOF ? '1px solid rgba(160,120,50,0.12)' : isSF ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.04)',
                                                background: isOF ? 'rgba(0,0,0,0.4)' : isSF ? c(0.025) : 'rgba(0,0,0,0.25)',
                                            }}>
                                                <span style={isOF ? {
                                                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(160,120,50,0.2)', fontFamily: '"Courier New", monospace',
                                                } : isSF ? {
                                                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace',
                                                } : {
                                                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)',
                                                }}>
                                                    ASOT // {s.title}
                                                </span>
                                                <span style={isOF ? {
                                                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(160,120,50,0.2)', fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                                } : isSF ? {
                                                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                                } : {
                                                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                                }}>
                                                    {operation.title}
                                                </span>
                                            </div>

                                        </div>
                                    ))
                            ) : (
                                // Legacy single-body fallback
                                <div style={isOF ? {
                                    position: 'relative',
                                    border: '1px solid rgba(160,120,50,0.25)',
                                    borderTop: `2px solid ${c(0.8)}`,
                                    background: '#1d1408',
                                } : isSF ? {
                                    position: 'relative',
                                    border: `1px solid ${c(0.3)}`,
                                    borderTop: `2px solid ${c(0.8)}`,
                                    background: 'rgba(0,4,14,0.82)',
                                    boxShadow: `0 0 20px ${c(0.1)}, inset 0 0 30px ${c(0.03)}`,
                                } : {
                                    position: 'relative',
                                    border: `1px solid ${c(0.18)}`,
                                    borderTop: `2px solid ${c(0.6)}`,
                                }}>
                                    {/* Sci-fi scan lines */}
                                    {isSF && (
                                        <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: `repeating-linear-gradient(to bottom, ${c(0.02)} 0px, ${c(0.02)} 1px, transparent 1px, transparent 4px)` }} />
                                    )}
                                    {/* Corner ticks — hidden in oldfashioned */}
                                    {!isOF && (
                                        <>
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                            </div>
                                            <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', zIndex: 1 }}>
                                                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                            </div>
                                        </>
                                    )}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                                        padding: '8px 20px',
                                        borderBottom: isOF ? '1px solid rgba(160,120,50,0.15)' : isSF ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.06)',
                                        background: isOF ? 'rgba(0,0,0,0.55)' : isSF ? c(0.06) : 'rgba(0,0,0,0.4)',
                                        ...(isSF ? { boxShadow: `inset 0 0 20px rgba(${r},${g},${b},0.05)` } : {}),
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={isOF ? {
                                                width: 8, height: 8, background: c(1), flexShrink: 0, borderRadius: 0,
                                            } : isSF ? {
                                                width: 6, height: 6, background: c(0.8), flexShrink: 0, boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)`,
                                            } : {
                                                width: 6, height: 6, background: c(0.7), flexShrink: 0,
                                            }} />
                                            <span style={isOF ? {
                                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8a850', fontFamily: '"Courier New", monospace',
                                            } : isSF ? {
                                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.9), textShadow: `0 0 6px rgba(${r},${g},${b},0.5)`, fontFamily: '"Courier New", monospace',
                                            } : {
                                                fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8),
                                            }}>
                                                Operation Orders
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                            {operation.status && (
                                                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: isOF ? 'rgba(160,120,50,0.35)' : 'rgba(237,237,237,0.3)' }}>
                                                    {operation.status}
                                                </span>
                                            )}
                                            {operation.department && (
                                                <>
                                                    <div style={{ width: 1, height: 10, background: isOF ? 'rgba(160,120,50,0.15)' : 'rgba(255,255,255,0.1)' }} />
                                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: isOF ? 'rgba(160,120,50,0.35)' : 'rgba(237,237,237,0.3)' }}>
                                                        {operation.department}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ padding: '0 28px' }}>
                                        <DocBody content={operation.content ?? null} themeColor={operation.themeColor || '#db001d'} pageTheme={pageTheme} />
                                    </div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '7px 20px',
                                        borderTop: isOF ? '1px solid rgba(160,120,50,0.12)' : isSF ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.04)',
                                        background: isOF ? 'rgba(0,0,0,0.4)' : isSF ? c(0.025) : 'rgba(0,0,0,0.25)',
                                    }}>
                                        <span style={isOF ? {
                                            fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(160,120,50,0.2)', fontFamily: '"Courier New", monospace',
                                        } : isSF ? {
                                            fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace',
                                        } : {
                                            fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)',
                                        }}>
                                            ASOT // End of Order
                                        </span>
                                        <span style={isOF ? {
                                            fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(160,120,50,0.2)', fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                        } : isSF ? {
                                            fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                        } : {
                                            fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                        }}>
                                            {operation.title}
                                        </span>
                                    </div>
                                </div>
                            )}


                            {/* Acknowledge card — bottom of content, after all sections */}
                            {showAcknowledgeCard && (
                                <DocAcknowledgeCard operationId={id} pageId='main' />
                            )}

                            {/* Classified banner — shown to logged-out users when sections are hidden */}
                            {hasHiddenSections && (
                                <a href={`/login?returnTo=/operations/${id}`} className='print-hide' style={{ textDecoration: 'none', display: 'block', marginBottom: 64 }}>
                                    <div style={{
                                        position: 'relative',
                                        overflow: 'hidden',
                                        padding: '28px 32px',
                                        background: 'rgba(180, 80, 0, 0.08)',
                                        borderTop: '2px solid rgba(220, 120, 0, 0.5)',
                                        borderBottom: '2px solid rgba(220, 120, 0, 0.5)',
                                        cursor: 'pointer',
                                    }}>
                                        {/* Diagonal stripe background */}
                                        <div style={{
                                            position: 'absolute', inset: 0, pointerEvents: 'none',
                                            backgroundImage: 'repeating-linear-gradient(45deg, rgba(220,120,0,0.04) 0px, rgba(220,120,0,0.04) 10px, transparent 10px, transparent 20px)',
                                        }} />

                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
                                            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(220,120,0,0.4))' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.42em', textTransform: 'uppercase', color: 'rgba(220, 140, 0, 0.95)' }}>
                                                    ██ Information Classified ██
                                                </span>
                                                <span style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>
                                                    Login to Access →
                                                </span>
                                            </div>
                                            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(220,120,0,0.4))' }} />
                                        </div>
                                    </div>
                                </a>
                            )}
                                </>
                            )}
                        </div>
                    )}

                    </div>{/* /Main content area */}
                </div>{/* /Left document+nav flex */}

                {/* Right: attendance sidebar / mobile drawer */}
                <AttendanceDrawer
                    operationId={id}
                    operationStatus={operation.status ?? ''}
                    myUserId={me?.id ?? null}
                    isHQ={isHQ}
                    isSectionLeader={isSectionLeader}
                    isAllStaff={isAllStaff}
                    themeColor={operation.themeColor || '#db001d'}
                />
            </div>

            {/*
                The live board, full width beneath the document. It is the same
                component the editor's Attendance tab renders — one board, two
                modes — because members and staff looking at different pictures
                of the same roster is exactly the confusion it exists to remove.
                What differs is `canManage`.

                Full width rather than inside the sidebar above: seventy
                positions plus a docked pool rail will not fit in a drawer.

                `.command` carries the palette (imported globally in layout);
                --acc is per-operation, so it is injected here the way the
                editor's shell injects it.
            */}
            {isLoggedIn && (
                <div
                    className='command'
                    style={{
                        ['--acc' as string]: operation.themeColor || '#db001d',
                        ['--acc-rgb' as string]: (() => {
                            const { r, g, b } = hexToRgb(operation.themeColor || '#db001d')
                            return `${r}, ${g}, ${b}`
                        })(),
                        borderTop: '1px solid var(--line)',
                        background: 'var(--bg)',
                    }}
                >
                    <AttendanceBoard
                        operationId={id}
                        operationName={operation.title ?? 'Operation'}
                        operationWhen={operation.date ? dayjs(operation.date).format('ddd D MMM · HH:mm') : 'No date set'}
                        myUserId={me?.id ?? null}
                        canManage={canManageAttendance}
                    />
                </div>
            )}

        </div>
    )
}
