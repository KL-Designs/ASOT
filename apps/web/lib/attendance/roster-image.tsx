import { ImageResponse } from 'next/og'
import { ROSTER_IMAGE, cardHeight, packColumns, type RosterSummary } from './discord-post'

/**
 * The roster as a picture, for the Discord attendance post.
 *
 * Every callsign with who is in it, then the game masters and who is not
 * attending. Drawn with `next/og` — the same renderer the bot's MILPAC card
 * uses — because it carries its own font: an SVG rasterised on the server
 * depends on fonts being installed in the container, and draws empty boxes
 * where they are not.
 *
 * The layout is worked out as numbers first (`packColumns`), then drawn with
 * fixed heights. The renderer has no flow layout to lean on, and a picture
 * whose height is guessed is one that clips its last row.
 */

const PAD = 28
const TITLE = 64
const FOOT_ROW = 26

const INK = '#e9eaec'
const DIM = '#8d939b'
const LINE = '#2a2e36'
const CARD = '#15181d'
const RED = '#db001d'

const line = (label: string, names: string[]) => (names.length ? `${label}: ${names.join(', ')}` : `${label}: none`)

/** Roughly how many lines a long list wraps to at the footer's width and size. */
const wrapLines = (text: string) => Math.max(1, Math.ceil(text.length / 150))

export async function renderRosterPng(title: string, summary: RosterSummary): Promise<Buffer> {
    const { columns, height: bodyHeight } = packColumns(summary.sections)
    const columnWidth = Math.floor((ROSTER_IMAGE.width - PAD * 2 - ROSTER_IMAGE.cardGap * (ROSTER_IMAGE.columns - 1)) / ROSTER_IMAGE.columns)

    const gm = line('Game masters', summary.gamemasters)
    const out = line('Not attending', summary.notAttending)
    const footHeight = (wrapLines(gm) + wrapLines(out)) * FOOT_ROW + 20
    const height = PAD + TITLE + Math.max(bodyHeight, ROSTER_IMAGE.rowHeight) + footHeight + PAD

    const image = new ImageResponse(
        (
            <div style={{ display: 'flex', flexDirection: 'column', width: ROSTER_IMAGE.width, height, background: '#0d0f12', color: INK, padding: PAD, fontSize: 15 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', height: TITLE, borderBottom: `2px solid ${RED}`, marginBottom: 0 }}>
                    <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>{title.slice(0, 60)}</div>
                    <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 18, color: DIM }}>{`${summary.attending} attending`}</div>
                </div>

                <div style={{ display: 'flex', height: Math.max(bodyHeight, ROSTER_IMAGE.rowHeight), marginTop: ROSTER_IMAGE.cardGap }}>
                    {columns.map((sections, c) => (
                        <div key={c} style={{ display: 'flex', flexDirection: 'column', width: columnWidth, marginRight: c < columns.length - 1 ? ROSTER_IMAGE.cardGap : 0 }}>
                            {sections.map(section => (
                                <div
                                    key={`${section.category}:${section.title}`}
                                    style={{ display: 'flex', flexDirection: 'column', height: cardHeight(section), marginBottom: ROSTER_IMAGE.cardGap, background: CARD, border: `1px solid ${LINE}` }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', height: ROSTER_IMAGE.headHeight, padding: '0 10px', borderBottom: `1px solid ${LINE}`, fontSize: 15, fontWeight: 700 }}>
                                        <div style={{ display: 'flex' }}>{section.title.slice(0, 22)}</div>
                                        <div style={{ display: 'flex', marginLeft: 'auto', color: DIM, fontSize: 13 }}>{`${section.members.length} / ${section.total}`}</div>
                                    </div>
                                    {section.members.length === 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', height: ROSTER_IMAGE.rowHeight, padding: '0 10px', color: DIM, fontSize: 13 }}>Nobody yet</div>
                                    )}
                                    {section.members.map((member, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', height: ROSTER_IMAGE.rowHeight, padding: '0 10px', fontSize: 14 }}>
                                            {member.name.slice(0, 30)}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12, paddingTop: 8, borderTop: `1px solid ${LINE}`, fontSize: 15, color: DIM }}>
                    <div style={{ display: 'flex', lineHeight: `${FOOT_ROW}px` }}>{gm}</div>
                    <div style={{ display: 'flex', lineHeight: `${FOOT_ROW}px` }}>{out}</div>
                </div>
            </div>
        ),
        { width: ROSTER_IMAGE.width, height },
    )

    return Buffer.from(await image.arrayBuffer())
}
