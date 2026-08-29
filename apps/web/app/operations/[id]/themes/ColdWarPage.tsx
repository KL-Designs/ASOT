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
import { readableOn, rgbTriplet } from '@/lib/colour'
import FileTabs from './FileTabs'
import PaperRsvp from './PaperRsvp'
import type { SpineDocument } from './OrdersSpine'
import type { ModernPageProps } from './theme-props'
import s from './coldwar.module.css'

const OCAP = '__ocap__'

/** The typing paper, as `coldwar.module.css` sets it — the ground the ribbon
 *  has to print legibly on. */
const PAPER = '#e8e2d2'

/**
 * The operation bar, repainted as the folder's label strip.
 *
 * The bar and its tab strip draw entirely from `.command` tokens, and that
 * class sits on the bar itself — so these have to arrive as inline styles to
 * outrank it. They are `var()` references rather than literals, because the
 * theme's own tokens are already in scope on `.page`: `coldwar.module.css`
 * stays the single place this palette is written down.
 *
 * Measured on `--paper-2`: the title reads 11.1:1 and tab labels 7.2:1. The
 * accent is the operation's own and cannot be measured here — `ColdWarPage`
 * darkens it to clear 4.5:1 on the paper before it ever reaches this file. The
 * three status inks are darkened for the same reason the ribbon is: the stock
 * green and amber are tuned for a near-black bar and wash out on manila.
 */
const PAPER_CHROME: Record<string, string> = {
    '--s1': 'var(--paper-2)',
    '--s2': 'var(--paper-3)',
    '--s3': 'var(--paper)',
    '--line': 'var(--rule)',
    '--line-2': 'rgba(70, 58, 38, 0.45)',
    '--ink': 'var(--carbon)',
    '--ink-2': 'var(--carbon-2)',
    '--ink-3': 'var(--carbon-3)',
    '--acc': 'var(--stamp)',
    '--acc-rgb': 'var(--stamp-rgb)',
    '--good': '#2f5c2b',
    '--warn': '#6f4e0c',
    '--crit': 'var(--stamp)',

    /*
     * The bar as a piece of folder card rather than a painted strip.
     *
     * Two crossing fibre gratings at shallow angles give it a tooth — one
     * grating alone reads as corduroy — over a top-to-bottom sheen, because
     * card catches light unevenly across its face.
     */
    '--bar-bg': [
        'repeating-linear-gradient(38deg, rgba(70, 58, 38, 0.05) 0 1px, transparent 1px 4px)',
        'repeating-linear-gradient(-52deg, rgba(70, 58, 38, 0.035) 0 1px, transparent 1px 5px)',
        'linear-gradient(180deg, #e4dcc9 0%, #d7ceb8 100%)',
    ].join(', '),

    /*
     * And its thickness, in four layers: the lit top face, the cut edge falling
     * into shadow at the bottom, the depth of the card itself, then the shadow
     * it throws on the desk below.
     */
    '--bar-shadow': [
        'inset 0 1px 0 rgba(255, 255, 255, 0.45)',
        'inset 0 -4px 6px -4px rgba(70, 58, 38, 0.5)',
        '0 2px 0 rgba(70, 58, 38, 0.2)',
        '0 7px 16px rgba(70, 58, 38, 0.3)',
    ].join(', '),

    '--bar-edge': '1px solid rgba(70, 58, 38, 0.5)',
}

/**
 * The Cold War orders page — "Declassified".
 *
 * The orders as a released file: a typed sheet on a dark desk, classification
 * banners at both ends, a stamp across the header, and a rail of file tabs down
 * the left for the rest of the folder.
 *
 * It shares Modern's data exactly — `page.tsx` does all the fetching and every
 * permission check — and disagrees with it about what the page *is*. That is
 * what a theme is for here, and why each one is its own file.
 *
 * Two things it does that no other theme does:
 *
 * - **Redaction.** A logged-out reader gets the document with the sections they
 *   cannot see struck out in place, rather than a banner at the bottom saying
 *   information is classified. Truer to the fiction and more useful: they can
 *   see how much is withheld and where it sits.
 * - **A routing slip.** The acknowledgement and the attendance call are the form
 *   a real file carries — a line to sign, and a line saying what you are
 *   detailed to. Live controls in the period's shape.
 */
export default function ColdWarPage({
    id, operation, isLoggedIn, isHQ, canZeus, canOcapManage, access, showAcknowledgeCard,
    activePageParam, fromJ2, attendance, lineage,
}: ModernPageProps) {
    /*
     * Zeus Notes pages are ordinary documents — same sections, same schema, same
     * editor — and the only thing that sets them apart is who may open one. A
     * viewer without `operations.zeus` never sees the page listed, so there is
     * nothing to click and nothing to 404 on.
     *
     * OCAP is still excluded here: it is a panel of match statistics appended
     * below, not a document with sections.
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

    /*
     * The ribbon. Darkened to print rather than used raw — a theme colour
     * chosen to glow on a dark site is routinely too pale for buff paper, and
     * this one carries the stamp, the section rules, the marginal tabs and
     * every heading in the document.
     */
    const stamp = readableOn(operation.themeColor || '#8c2b1d', PAPER, 4.5)

    return (
        <div
            className={s.page}
            style={{ ['--stamp' as string]: stamp, ['--stamp-rgb' as string]: rgbTriplet(stamp) }}
        >
            <HideSiteNav />
            <OperationBar
                operationId={id}
                title={operation.title}
                status={operation.status}
                themeColor={operation.themeColor}
                active='orders'
                canEdit={isHQ}
                access={access}
                fromJ2={fromJ2}
                palette={PAPER_CHROME}
            />

            <div className={s.desk}>
              <div className={s.folder}>
                <FileTabs
                    operationId={id}
                    documents={documents}
                    activeDocument={activeDocument}
                    sections={onContent ? readable.map(sec => ({ id: sec.id, title: sec.title })) : []}
                    fromJ2={fromJ2}
                />

                <div className={s.sheetWrap}>
                    {!onContent ? (
                        /* Staff instruments, not orders — they keep the dark chrome
                           they wear everywhere else and sit on the bare desk. */
                        <div className={s.panel}>
                            {activeDocument === OCAP && hasOcap && (
                                <>
                                    {canOcapManage && <OcapLinkPanel operationId={id} initialOcap={operation.ocap ?? null} />}
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
                            <div className={s.classification}>Secret — ASOT eyes only</div>

                            <header className={s.head}>
                                <div className={s.headRow}>
                                    <div className={s.headMain}>
                                        <div className={s.org}>
                                            <span>{[operation.department, documentTitle].filter(Boolean).join(' · ')}</span>
                                            {operation.status && <span>{operation.status}</span>}
                                        </div>
                                        <h1 className={s.title}>{operation.title || 'Untitled Operation'}</h1>
                                        {(lineage || operation.daySlot) && (
                                            <div className={s.lineage}>
                                                {[
                                                    lineage?.campaign,
                                                    lineage?.sequence ? `Mission ${lineage.sequence}` : null,
                                                    operation.daySlot ? `${operation.daySlot} serial` : null,
                                                ].filter(Boolean).join(' · ')}
                                            </div>
                                        )}
                                        <div className={s.stamp}>Declassified</div>

                                        {/*
                                            The whole reference block sits in the header
                                            beside the print, the way a file's cover
                                            carries its particulars. Below the rule they
                                            were three stacked bands the reader had to
                                            get past before reaching paragraph one.
                                        */}
                                        <dl className={s.refs}>
                                            {operation.date && (
                                                <div className={s.ref}>
                                                    <dt className={s.refKey}>Step off</dt>
                                                    <dd className={s.refVal}>
                                                        <LocalDate iso={new Date(operation.date).toISOString()} />
                                                    </dd>
                                                </div>
                                            )}
                                            {loreDate?.isValid() && (
                                                <div className={s.ref}>
                                                    <dt className={s.refKey}>In-game date</dt>
                                                    <dd className={s.refVal}>{loreDate.format('DD MMM YYYY').toUpperCase()}</dd>
                                                </div>
                                            )}
                                            {operation.mapWorld && (
                                                <div className={s.ref}>
                                                    <dt className={s.refKey}>Map</dt>
                                                    <dd className={s.refVal}>{operation.mapWorld.toUpperCase()}</dd>
                                                </div>
                                            )}
                                            {attendance.seats > 0 && (
                                                <div className={s.ref}>
                                                    <dt className={s.refKey}>Positions</dt>
                                                    <dd className={s.refVal}>{attendance.filled} / {attendance.seats}</dd>
                                                </div>
                                            )}
                                            <PaperRsvp operationId={id} rsvpOpen={attendance.rsvpOpen} />
                                        </dl>

                                        {(showAcknowledgeCard || isLoggedIn) && (
                                            <div className={s.slip}>
                                                {showAcknowledgeCard && (
                                                    <a className={`${s.slipRow} ${s.slipOutstanding}`} href='#acknowledge'>
                                                        <span className={s.slipMain}>
                                                            <span className={s.slipKey}>Acknowledged by</span>
                                                            <span className={s.slipVal}>Outstanding — not yet signed</span>
                                                        </span>
                                                        <span className={s.slipBtn}>Sign</span>
                                                    </a>
                                                )}
                                                {isLoggedIn && (
                                                    <Link className={s.slipRow} href={attendanceHref}>
                                                        <span className={s.slipMain}>
                                                            <span className={s.slipKey}>Detailed to</span>
                                                            <span className={s.slipVal}>{postingLine(attendance)}</span>
                                                        </span>
                                                        <span className={s.slipBtn}>Board</span>
                                                    </Link>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/*
                                        Taped into the header rather than set into the body.
                                        Down there it read as part of the orders, and a typed
                                        page that appears to contain a photograph stops
                                        looking typed.
                                    */}
                                    {operation.coverImage && (
                                        <figure className={s.photo}>
                                            <img className={s.photoImg} src={operation.coverImage} alt='' />
                                            <figcaption className={s.photoCap}>
                                                Fig. 1 — {operation.mapWorld ? `${operation.mapWorld}, ` : ''}area of operations
                                            </figcaption>
                                        </figure>
                                    )}
                                </div>
                            </header>

                            <div className={s.body}>
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
                                                    <span className={s.paraNum}>{i + 1}.</span>
                                                    <h2 className={s.paraTitle}>{visible ? sec.title : 'Withheld'}</h2>
                                                    {isLoggedIn && !sec.isPublic && (
                                                        <span className={s.paraTag}>Classified</span>
                                                    )}
                                                </div>

                                                {visible
                                                    ? <DocBody content={sec.content ?? null} themeColor={operation.themeColor || '#db001d'} />
                                                    : <Redacted />}
                                            </section>
                                        )
                                    })
                                ) : operation.content ? (
                                    <section className={s.para} data-print-section>
                                        <div className={s.paraHead}>
                                            <span className={s.paraNum}>1.</span>
                                            <h2 className={s.paraTitle}>Operation Orders</h2>
                                        </div>
                                        <DocBody content={operation.content} themeColor={operation.themeColor || '#db001d'} />
                                    </section>
                                ) : (
                                    <p className={s.empty}>No orders have been typed yet.</p>
                                )}

                                {showAcknowledgeCard && (
                                    <div id='acknowledge'>
                                        <DocAcknowledgeCard operationId={id} pageId='main' />
                                    </div>
                                )}
                            </div>

                            <div className={s.foot}>
                                <span>{operation.department || 'ASOT'} · {documentTitle}</span>
                                <span>
                                    {isLoggedIn
                                        ? `${attendance.attending} attending`
                                        : <Link className={s.footLink} href={`/login?returnTo=/operations/${id}` as Route}>Log in for the withheld paragraphs</Link>}
                                </span>
                            </div>

                            <div className={s.classification}>Secret — ASOT eyes only</div>
                        </article>
                    )}
                </div>
              </div>
            </div>

            {/* Same repaint as the bar — otherwise it is one dark chip on a buff desk. */}
            {isHQ && <EditOrdersButton operationId={id} themeColor={operation.themeColor} palette={PAPER_CHROME} />}
        </div>
    )
}

/** Struck-out stand-in for a paragraph this reader is not cleared for. */
function Redacted() {
    // Uneven, so it reads as text removed rather than as a loading skeleton.
    const widths = ['96%', '88%', '72%', '93%', '61%']

    return (
        <div className={s.redacted} aria-label='Withheld — log in to read this paragraph'>
            {widths.map((w, i) => <div key={i} className={s.redactBar} style={{ width: w }} />)}
            <p className={s.redactNote}>Paragraph withheld from this copy.</p>
        </div>
    )
}

/** What the routing slip says you are down for. */
function postingLine(attendance: ModernPageProps['attendance']): string {
    if (attendance.myRsvp === 'not_attending') return 'Excused — not attending'
    if (attendance.myPosition) return attendance.myPosition
    if (attendance.myRsvp === 'attending') return 'Attending — no position allotted'
    return attendance.rsvpOpen ? 'No return made' : 'Not detailed'
}
