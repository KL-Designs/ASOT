'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const ZEUS_TAB = '__zeus__'
const OCAP_TAB = '__ocap__'

interface PageNavItem {
    id: string
    title: string
    color?: string   // special accent color (zeus = cyan, ocap = green)
    isSeparator?: boolean
}

interface Props {
    items: PageNavItem[]
    activePage: string
    themeColor: string
    pageTheme: 'modern' | 'oldfashioned' | 'scifi'
    r: number
    g: number
    b: number
}

export default function PageNavClient({ items, activePage, themeColor, pageTheme, r, g, b }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const isOF = pageTheme === 'oldfashioned'
    const isSF = pageTheme === 'scifi'
    const c = useCallback((a: number) => `rgba(${r},${g},${b},${a})`, [r, g, b])

    function navigate(pageId: string) {
        const params = new URLSearchParams(searchParams.toString())
        if (pageId === items.find(i => i.id === pageId && !i.isSeparator && i === items[0])?.id) {
            params.delete('page')
        } else {
            params.set('page', pageId)
        }
        router.push(`${pathname}?${params.toString()}` as any, { scroll: false })
    }

    return (
        <div style={{
            width: 188,
            flexShrink: 0,
            position: 'sticky',
            top: 80,
            alignSelf: 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '20px 12px 20px 14px',
            borderRight: isOF
                ? '1px solid rgba(160,120,50,0.2)'
                : isSF
                    ? `1px solid ${c(0.2)}`
                    : '1px solid rgba(255,255,255,0.07)',
            maxHeight: 'calc(100vh - 100px)',
            overflowY: 'auto',
        }}>
            <div style={{
                fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: isOF ? 'rgba(160,120,50,0.35)' : isSF ? c(0.3) : 'rgba(237,237,237,0.2)',
                marginBottom: 8, paddingLeft: 8,
                fontFamily: isOF || isSF ? '"Courier New", monospace' : undefined,
            }}>
                Documents
            </div>

            {items.map((item, idx) => {
                if (item.isSeparator) {
                    return (
                        <div
                            key={`sep-${idx}`}
                            style={{
                                height: 1,
                                background: item.color ? `${item.color.replace('0.8', '0.12')}` : 'rgba(255,255,255,0.07)',
                                margin: '6px 0',
                            }}
                        />
                    )
                }

                const isActive = item.id === activePage
                const accentColor = item.color

                // Special colored nav items (Zeus, OCAP) — only for rgba() colors, not hex page colors
                if (accentColor && accentColor.startsWith('rgba')) {
                    const baseColor = accentColor
                    const dimColor = accentColor.replace('0.8', '0.4')
                    return (
                        <button
                            key={item.id}
                            type='button'
                            onClick={() => navigate(item.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px',
                                textAlign: 'left',
                                background: isActive ? accentColor.replace('0.8', '0.08') : 'transparent',
                                borderTop: isActive ? `1px solid ${accentColor.replace('0.8', '0.25')}` : '1px solid transparent',
                                borderRight: isActive ? `1px solid ${accentColor.replace('0.8', '0.25')}` : '1px solid transparent',
                                borderBottom: isActive ? `1px solid ${accentColor.replace('0.8', '0.25')}` : '1px solid transparent',
                                borderLeft: isActive ? `3px solid ${accentColor.replace('0.8', '0.7')}` : '3px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                width: '100%',
                            }}
                            onMouseEnter={e => {
                                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = accentColor.replace('0.8', '0.04')
                            }}
                            onMouseLeave={e => {
                                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                            }}
                        >
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: isActive ? 700 : 500,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: isActive ? baseColor : dimColor,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {item.title}
                            </span>
                        </button>
                    )
                }

                // Normal page items
                return (
                    <button
                        key={item.id}
                        type='button'
                        onClick={() => navigate(item.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 10px',
                            textAlign: 'left',
                            background: isActive
                                ? isOF ? 'rgba(160,120,50,0.1)' : c(0.1)
                                : 'transparent',
                            borderTop: isActive
                                ? isOF ? '1px solid rgba(160,120,50,0.35)' : isSF ? `1px solid ${c(0.35)}` : `1px solid ${c(0.25)}`
                                : '1px solid transparent',
                            borderRight: isActive
                                ? isOF ? '1px solid rgba(160,120,50,0.35)' : isSF ? `1px solid ${c(0.35)}` : `1px solid ${c(0.25)}`
                                : '1px solid transparent',
                            borderBottom: isActive
                                ? isOF ? '1px solid rgba(160,120,50,0.35)' : isSF ? `1px solid ${c(0.35)}` : `1px solid ${c(0.25)}`
                                : '1px solid transparent',
                            borderLeft: item.color && isActive
                                ? `3px solid ${item.color}`
                                : isActive
                                    ? isOF ? `3px solid rgba(160,120,50,0.8)` : `3px solid ${c(0.85)}`
                                    : item.color ? `3px solid ${item.color.replace(/[\d.]+\)$/, '0.3)')}` : '3px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.12s',
                            width: '100%',
                            ...(isSF && isActive ? { boxShadow: `0 0 8px ${c(0.15)}, inset 0 0 8px ${c(0.04)}` } : {}),
                        }}
                        onMouseEnter={e => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = isOF ? 'rgba(160,120,50,0.05)' : 'rgba(255,255,255,0.04)'
                        }}
                        onMouseLeave={e => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                        }}
                    >
                        <span style={{
                            fontSize: '0.65rem',
                            fontWeight: isActive ? 700 : 500,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: isActive
                                ? isOF ? '#c8a850' : isSF ? c(0.95) : 'rgba(237,237,237,0.9)'
                                : isOF ? 'rgba(160,120,50,0.45)' : isSF ? c(0.4) : c(0.5),
                            fontFamily: isOF || isSF ? '"Courier New", monospace' : undefined,
                            ...(isSF && isActive ? { textShadow: `0 0 6px ${c(0.6)}` } : {}),
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {item.title}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
