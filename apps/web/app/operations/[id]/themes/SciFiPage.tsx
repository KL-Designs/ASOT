import dayjs from 'dayjs'
import Link from 'next/link'
import type { Route } from 'next'
import DocBody from '../doc-body'
import LocalDate from '../local-date'
import OcapLinkPanel from '../OcapLinkPanel'
import OcapStatsPanel from '../OcapStatsPanel'
import DocAcknowledgeCard from '../DocAcknowledgeCard'
import OperationBar from '../OperationBar'
import EditOrdersButton from '../EditOrdersButton'
import HideSiteNav from '@/components/HideSiteNav'
import ConsoleRail from './ConsoleRail'
import ConsoleRsvp from './ConsoleRsvp'
import type { SpineDocument } from './OrdersSpine'
import type { ModernPageProps } from './theme-props'
import s from './scifi.module.css'

const OCAP = '__ocap__'

/** Ten segments, because a console reads in segments. */
const SEATS_SEGMENTS = 10

/**
 * The operation bar, repainted as the console's own strip.
 *
 * Same contract Cold War established: the bar and its tab strip draw entirely
 * from `.command` tokens, and that class sits on the bar itself — so these have
 * to arrive as inline styles to outrank it. They are `var()` references rather
 * than literals wherever the theme already has a token for it, so
 * `scifi.module.css` stays the one place this palette is written down.
 *
 * The bar is the one lit thing outside the glass, and it is lit the way a
 * backlit panel is rather than the way the tube is: a dark strip with a
 * phosphor hairline under it. Measured on that strip, the title reads 15.4:1,
 * tab labels 6.1:1 and the accent 12.6:1.
 */
const CONSOLE_CHROME: Record<string, string> = {
    '--s1': '#101519',
    '--s2': '#161d21',
    '--s3': '#1d2529',
    '--line': 'var(--grid)',
    '--line-2': 'rgba(98, 232, 176, 0.28)',
    '--ink': 'var(--ink)',
    '--ink-2': 'var(--ink-2)',
    '--ink-3': 'var(--ink-3)',
    '--acc': 'var(--phos)',
    '--acc-rgb': '98, 232, 176',
    /* The status dot. Amber for Upcoming is the same warm-second-voice rule the
       RSVP gauge follows, and the stock green would be indistinguishable from
       the phosphor everything else on the bar is drawn in. */
    '--good': 'var(--phos-2)',
    '--warn': 'var(--amber)',
    '--crit': 'var(--alarm)',

    /* Backlit glass rather than painted metal: a faint phosphor cast rising
       through a dark strip, with the tube's own fibre showing in it. */
    '--bar-bg': [
        'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px)',
        'linear-gradient(180deg, rgba(23, 33, 32, 0.96) 0%, rgba(10, 15, 15, 0.98) 100%)',
    ].join(', '),

    /* The hairline the strip sits on, then its shadow on the glass below. */
    '--bar-shadow': [
        'inset 0 1px 0 rgba(98, 232, 176, 0.10)',
        '0 1px 0 rgba(98, 232, 176, 0.18)',
        '0 10px 30px rgba(0, 0, 0, 0.6)',
    ].join(', '),

    '--bar-edge': '1px solid rgba(98, 232, 176, 0.22)',

    /*
     * The one thing this theme adds to the tab strip: the active tab's
     * underline emits. It is the light the rule throws *up* onto the strip
     * above it, painted as a background so it cannot escape the tab's own box
     * — see the note in `tabs.module.css` for why that shape and not a
     * box-shadow. Steep falloff, because phosphor is bright at the source and
     * gone within a few millimetres of it.
     */
    '--tab-glow': [
        'linear-gradient(0deg,',
        'rgba(98, 232, 176, 0.40) 0%,',
        'rgba(98, 232, 176, 0.16) 30%,',
        'rgba(98, 232, 176, 0.04) 62%,',
        'transparent 100%)',
    ].join(' '),
}

/**
 * The Sci-Fi orders page — "Bridge Console".
 *
 * The orders as a slab of dead-black glass with phosphor burning inside, run
 * to all four edges of the window. The whole theme rests on one rule — **the
 * light never leaves the screen** — which is what separates a CRT from a
 * filter laid over a page. It wore a bezel until that was seen at size: a
 * bezel is a thing you look *at*, and edge to edge the reader is looking
 * *through*.
 *
 * It shares Modern's data exactly (`page.tsx` does all the fetching and every
 * permission check) and disagrees with it about what the page *is*. That is
 * what a theme is for here, and why each one is its own file.
 *
 * Two things it does that Modern does not:
 *
 * - **The console outlives the document.** Title, gauges and the two calls sit
 *   on the screen rather than on the open document, so they stay put when you
 *   switch pages in the rail. A console's readout does not change because you
 *   changed channel.
 * - **Encryption instead of a locked banner.** A logged-out reader gets the
 *   document with the paragraphs they cannot see rendered as signal that
 *   arrives and fails to resolve, in place. Same call Cold War made with its
 *   strikeouts, and for the same reason: you can see how much is withheld and
 *   where it sits.
 */
export default function SciFiPage({
    id, operation, isLoggedIn, isHQ, canZeus, showAcknowledgeCard,
    activePageParam, fromJ2, attendance, lineage,
}: ModernPageProps) {
    /*
     * Zeus Notes pages are ordinary documents — same sections, same schema,
     * same editor — and the only thing that sets them apart is who may open
     * one. A viewer without `operations.zeus` never sees the page listed, so
     * there is nothing to click and nothing to 404 on.
     *
     * OCAP is still excluded here: it is a panel of match statistics, not a
     * document with sections.
     *
     * The id de-dupe guards against stale Yjs race-condition data in Mongo,
     * which has produced duplicate pages before.
     */
    const seen = new Set<string>()
    const contentPages = (operation.pages ?? []).filter(pg => {
        if (pg.pageType === 'ocap') return false
        if (pg.pageType === 'zeus' && !canZeus) return false
        if (seen.has(pg.id)) return false
        seen.add(pg.id)
        return true
    })

    const documents: SpineDocument[] = contentPages.length > 1
        ? contentPages.map(pg => ({ id: pg.id, title: pg.title, group: 'orders' as const }))
        : [{ id: contentPages[0]?.id ?? 'main', title: contentPages[0]?.title || 'Operation Orders', group: 'orders' as const }]

    const hasOcap = isHQ || (isLoggedIn && !!operation.ocap)
    if (hasOcap) documents.push({ id: OCAP, title: 'OCAP Replay', group: 'aside' })

    const validIds = documents.map(d => d.id)
    const activeDocument = activePageParam && validIds.includes(activePageParam)
        ? activePageParam
        : documents[0].id
    const onContent = activeDocument !== OCAP

    const rawSections = activeDocument === 'main'
        ? operation.sections ?? []
        : operation.extraPageSections?.[activeDocument] ?? operation.sections ?? []
    const readable = rawSections.filter(sec => isLoggedIn || sec.isPublic)

    const documentTitle = documents.find(doc => doc.id === activeDocument)?.title ?? 'Operation Orders'
    const loreDate = operation.loreDate ? dayjs(operation.loreDate) : null
    const attendanceHref = `/operations/${id}/attendance` as Route

    const refLine = [
        operation.department,
        lineage?.campaign,
        lineage?.sequence ? `Mission ${String(lineage.sequence).padStart(2, '0')}` : null,
        operation.daySlot ? `${operation.daySlot} serial` : null,
    ].filter(Boolean).join(' // ')

    return (
        <div className={s.page}>
            <HideSiteNav />
            <OperationBar
                operationId={id}
                title={operation.title}
                status={operation.status}
                themeColor={operation.themeColor}
                active='orders'
                canEdit={isHQ}
                signedIn={isLoggedIn}
                fromJ2={fromJ2}
                palette={CONSOLE_CHROME}
            />

            <div className={s.glass}>
                <div className={s.sweep} aria-hidden />

                <div className={s.screen}>
                    <header className={operation.coverImage ? s.head : `${s.head} ${s.headSolo}`}>
                        <div>
                            <p className={s.ref}>
                                {refLine ? <span className={s.refLit}>{refLine}</span> : null}
                                {refLine && operation.status ? ' // ' : ''}
                                {operation.status}
                            </p>
                            <h1 className={s.title}>{operation.title || 'Untitled Operation'}</h1>
                        </div>

                        {operation.coverImage && (
                            <figure className={s.feed}>
                                <img className={s.feedImg} src={operation.coverImage} alt='' />
                                <figcaption className={s.feedCap}>
                                    <span>{'Feed 01 // '}{operation.mapWorld || 'AO'}</span>
                                    <span className={s.feedRec}>● REC</span>
                                </figcaption>
                            </figure>
                        )}
                    </header>

                    <dl className={s.gauges}>
                        {operation.date && (
                            <div className={s.gauge}>
                                <dt className={s.gaugeKey}>Step off</dt>
                                <dd className={s.gaugeVal}><LocalDate iso={new Date(operation.date).toISOString()} /></dd>
                            </div>
                        )}
                        {loreDate?.isValid() && (
                            <div className={s.gauge}>
                                <dt className={s.gaugeKey}>In-game</dt>
                                <dd className={s.gaugeVal}>{loreDate.format('DD MMM YYYY').toUpperCase()}</dd>
                            </div>
                        )}
                        {operation.mapWorld && (
                            <div className={s.gauge}>
                                <dt className={s.gaugeKey}>Map</dt>
                                <dd className={s.gaugeVal}>{operation.mapWorld.toUpperCase()}</dd>
                            </div>
                        )}
                        {attendance.seats > 0 && (
                            <div className={s.gauge}>
                                <dt className={s.gaugeKey}>Positions</dt>
                                <dd className={s.gaugeVal}>{attendance.filled} / {attendance.seats}</dd>
                                <SeatBar filled={attendance.filled} seats={attendance.seats} />
                            </div>
                        )}
                        <ConsoleRsvp operationId={id} rsvpOpen={attendance.rsvpOpen} />
                    </dl>

                    {(showAcknowledgeCard || isLoggedIn) && (
                        <div className={s.calls}>
                            {showAcknowledgeCard && (
                                <a className={s.alert} href='#acknowledge'>
                                    <span>
                                        <span className={s.alertKey}>Acknowledgement outstanding</span>
                                        <span className={s.alertSub}>These orders are not yet signed</span>
                                    </span>
                                    <span className={s.btnRed}>Sign</span>
                                </a>
                            )}
                            {isLoggedIn && (
                                <Link className={s.muster} href={attendanceHref}>
                                    <span>
                                        <span className={s.musterKey}>{postingLine(attendance)}</span>
                                        <span className={s.musterSub}>{seatLine(attendance)}</span>
                                    </span>
                                    <span className={s.btnGo}>Muster board →</span>
                                </Link>
                            )}
                        </div>
                    )}

                    <div className={s.body}>
                        <ConsoleRail
                            operationId={id}
                            documents={documents}
                            activeDocument={activeDocument}
                            sections={onContent ? readable.map(sec => ({ id: sec.id, title: sec.title })) : []}
                            fromJ2={fromJ2}
                        />

                        {!onContent ? (
                            /* Staff instruments, not orders. They keep the dark chrome they
                               wear everywhere else — the glass behind them is dark, so they
                               need nothing from this theme but room. */
                            <div className={s.panel}>
                                {activeDocument === OCAP && hasOcap && (
                                    <>
                                        {isHQ && <OcapLinkPanel operationId={id} initialOcap={operation.ocap ?? null} />}
                                        {isLoggedIn && !!operation.ocap?.playerStats?.length && (
                                            <OcapStatsPanel
                                                ocap={operation.ocap}
                                                themeColor={operation.themeColor || '#db001d'}
                                                r={219} g={0} b={29}
                                                pageTheme='modern'
                                                operationId={id}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <article className={s.sheet}>
                                <div className={s.sheetTop}>
                                    <span>{documentTitle}</span>
                                    <span><span className={s.sheetTopLit}>Secret</span>{' // ASOT eyes only'}</span>
                                </div>

                                <div className={s.sheetBody}>
                                    {rawSections.length > 0 ? (
                                        rawSections.map((sec, i) => {
                                            const visible = isLoggedIn || sec.isPublic
                                            return (
                                                <section
                                                    key={sec.id}
                                                    id={visible ? `section-${sec.id}` : undefined}
                                                    data-print-section={visible ? true : undefined}
                                                    className={s.para}
                                                >
                                                    <div className={s.paraHead}>
                                                        <span className={s.paraNum}>{String(i + 1).padStart(2, '0')}</span>
                                                        <h2 className={s.paraTitle}>{visible ? sec.title : 'Withheld'}</h2>
                                                        {isLoggedIn && !sec.isPublic && (
                                                            <span className={s.paraTag}>Classified</span>
                                                        )}
                                                    </div>

                                                    {visible
                                                        ? <DocBody content={sec.content ?? null} themeColor={operation.themeColor || '#db001d'} />
                                                        : <Encrypted />}
                                                </section>
                                            )
                                        })
                                    ) : operation.content ? (
                                        <section className={s.para} data-print-section>
                                            <div className={s.paraHead}>
                                                <span className={s.paraNum}>01</span>
                                                <h2 className={s.paraTitle}>Operation Orders</h2>
                                            </div>
                                            <DocBody content={operation.content} themeColor={operation.themeColor || '#db001d'} />
                                        </section>
                                    ) : (
                                        <p className={s.empty}>No orders have been written yet.</p>
                                    )}

                                    {showAcknowledgeCard && (
                                        <div id='acknowledge'>
                                            <DocAcknowledgeCard operationId={id} pageId='main' />
                                        </div>
                                    )}
                                </div>
                            </article>
                        )}
                    </div>

                    <div className={s.foot}>
                        <span>{operation.department || 'ASOT'}{' // '}{documentTitle}</span>
                        <span>
                            {isLoggedIn
                                ? `${attendance.attending} attending`
                                : <Link className={s.footLink} href={`/login?returnTo=/operations/${id}` as Route}>Log in to decrypt the withheld paragraphs</Link>}
                        </span>
                    </div>
                </div>
            </div>

            {/* Same repaint as the bar — otherwise it is one red chip on a green screen. */}
            {isHQ && <EditOrdersButton operationId={id} themeColor={operation.themeColor} palette={CONSOLE_CHROME} />}
        </div>
    )
}

/**
 * Seats as a segmented bar.
 *
 * Answers "nearly full?" at a glance, which "28 / 34" beside it does not — the
 * number is the precise answer and this is the fast one. Rounds up, so one
 * filled seat always lights one segment rather than none.
 */
function SeatBar({ filled, seats }: { filled: number; seats: number }) {
    const lit = seats > 0 ? Math.min(SEATS_SEGMENTS, Math.ceil((filled / seats) * SEATS_SEGMENTS)) : 0

    return (
        <div className={s.bars} aria-hidden>
            {Array.from({ length: SEATS_SEGMENTS }, (_, i) => (
                <span key={i} className={i < lit ? `${s.barSeg} ${s.barOn}` : s.barSeg} />
            ))}
        </div>
    )
}

/** Signal that arrives and fails to resolve — a paragraph this reader is not
 *  cleared for. Uneven bars, so it reads as content withheld rather than as a
 *  loading skeleton. */
function Encrypted() {
    const widths = ['97%', '84%', '91%', '69%', '88%']

    return (
        <div className={s.encrypted} aria-label='Withheld — log in to read this paragraph'>
            {widths.map((w, i) => <div key={i} className={s.encBar} style={{ width: w }} />)}
            <p className={s.encNote}>Signal withheld from this terminal.</p>
        </div>
    )
}

/** What the muster call says you are down for. */
function postingLine(attendance: ModernPageProps['attendance']): string {
    if (attendance.myRsvp === 'not_attending') return 'Excused — not attending'
    if (attendance.myPosition) return `Detailed: ${attendance.myPosition}`
    if (attendance.myRsvp === 'attending') return 'Attending — no position allotted'
    return attendance.rsvpOpen ? 'No return made' : 'Not detailed'
}

/** The state of the roster underneath it. */
function seatLine(attendance: ModernPageProps['attendance']): string {
    if (attendance.seats > 0) return `${attendance.filled} of ${attendance.seats} seats filled`
    return attendance.rsvpOpen ? 'RSVP open — no roster cut yet' : 'Roster not cut'
}
