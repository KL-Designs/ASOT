import dayjs from 'dayjs'
import Link from 'next/link'
import type { Route } from 'next'
import { hexToRgb, rgbTriplet } from '@/lib/colour'
import DocBody from '../doc-body'
import LocalDate from '../local-date'
import PrintButton from '../print-button'
import ZeusNotesPanel from '../ZeusNotesPanel'
import OcapLinkPanel from '../OcapLinkPanel'
import OcapStatsPanel from '../OcapStatsPanel'
import DocAcknowledgeCard from '../DocAcknowledgeCard'
import OperationBar from '../OperationBar'
import EditOrdersButton from '../EditOrdersButton'
import HideSiteNav from '@/components/HideSiteNav'
import OrdersSpine, { type SpineDocument } from './OrdersSpine'
import StepOff from './StepOff'
import RsvpCell from './RsvpCell'
import type { ModernPageProps } from './theme-props'
import s from './modern.module.css'

const ZEUS = '__zeus__'
const OCAP = '__ocap__'

/**
 * The Modern orders page — "Warning Order".
 *
 * The reordering is the design. What a member owes — acknowledge the orders,
 * take a position — comes above the document rather than below it or beside it,
 * because that is what most people open this page to do. The cover shrinks from
 * a screen to a band with the operation's facts welded to its bottom edge, and
 * the two navigations the old page ran at once collapse into one outline.
 *
 * The attendance rail is gone. It duplicated the Attendance tab and held a
 * quarter of the window open for a control used once per operation; in its
 * place is one call to action that says what you have and haven't done.
 */
export default function ModernPage({
    id, operation, isLoggedIn, isHQ, isJ6, showAcknowledgeCard,
    activePageParam, fromJ2, attendance, lineage,
}: ModernPageProps) {
    const accent = operation.themeColor || '#db001d'
    const rgb = hexToRgb(accent)

    /*
     * Zeus and OCAP are appended as their own entries below, so they must not
     * also come through as content pages. The id de-dupe guards against stale
     * Yjs race-condition data in Mongo, which has produced duplicate pages
     * before.
     */
    const seen = new Set<string>()
    const contentPages = (operation.pages ?? []).filter(pg => {
        if (pg.pageType === 'zeus' || pg.pageType === 'ocap') return false
        if (seen.has(pg.id)) return false
        seen.add(pg.id)
        return true
    })

    const documents: SpineDocument[] = contentPages.length > 1
        ? contentPages.map(pg => ({ id: pg.id, title: pg.title, group: 'orders' as const }))
        : [{ id: contentPages[0]?.id ?? 'main', title: contentPages[0]?.title || 'Operation Orders', group: 'orders' as const }]

    const hasOcap = isHQ || (isLoggedIn && !!operation.ocap)
    if (isJ6) documents.push({ id: ZEUS, title: 'Zeus Notes', group: 'aside' })
    if (hasOcap) documents.push({ id: OCAP, title: 'OCAP Replay', group: 'aside' })

    const validIds = documents.map(d => d.id)
    const activeDocument = activePageParam && validIds.includes(activePageParam)
        ? activePageParam
        : documents[0].id

    const onContent = activeDocument !== ZEUS && activeDocument !== OCAP

    // `main` is the operation's own sections; every other page keeps its
    // sections in `extraPageSections` under its id.
    const rawSections = activeDocument === 'main'
        ? operation.sections ?? []
        : operation.extraPageSections?.[activeDocument] ?? operation.sections ?? []
    const sections = rawSections.filter(sec => isLoggedIn || sec.isPublic)

    const hasHiddenSections = !isLoggedIn && (
        (operation.sections?.some(sec => !sec.isPublic) ?? false)
        || Object.values(operation.extraPageSections ?? {}).some(secs => secs.some(sec => !sec.isPublic))
    )

    // The eyebrow over every section header, the way the editor shows it.
    const documentTitle = documents.find(doc => doc.id === activeDocument)?.title ?? 'Operation Orders'

    const attendanceHref = `/operations/${id}/attendance` as Route
    const loreDate = operation.loreDate ? dayjs(operation.loreDate) : null

    return (
        <div
            className={`command ${s.page}`}
            style={{
                ['--acc' as string]: accent,
                ['--acc-rgb' as string]: rgbTriplet(accent),
            }}
        >
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
            />

            {/* ── Hero band ──────────────────────────────────────────────── */}
            <header
                className={operation.coverImage ? s.hero : `${s.hero} ${s.heroBare}`}
                style={operation.coverImage ? { backgroundImage: `url(${operation.coverImage})` } : undefined}
            >
                <div className={s.heroShade} />
                <div className={s.heroGrid} />
                <div className={s.heroRow}>
                    <div className={s.heroInner}>
                        {/*
                            Where this operation sits: which department runs it, which
                            campaign it belongs to, which mission of that campaign, and
                            which night of the pair. "Saturday serial" on its own said a
                            night without saying a night *of* what.
                        */}
                        <Eyebrow
                            parts={[
                                operation.department,
                                lineage?.campaign,
                                lineage?.sequence ? `Mission ${lineage.sequence}` : null,
                                operation.daySlot ? `${operation.daySlot} serial` : null,
                            ]}
                        />
                        <h1 className={s.heroTitle}>{operation.title || 'Untitled Operation'}</h1>
                    </div>

                    <StepOff
                        iso={operation.date ? new Date(operation.date).toISOString() : null}
                        status={operation.status}
                    />
                </div>
            </header>

            {/*
                The ledger. Auto-fit, so an operation with no terrain or no
                in-game date simply has fewer cells rather than a gap where a
                fact isn't — the old page rendered empty chrome either way.
            */}
            <dl className={s.ledger}>
                {operation.date && (
                    <div className={s.cell}>
                        <dt className={s.cellKey}>Step off</dt>
                        <dd className={s.cellVal}><LocalDate iso={new Date(operation.date).toISOString()} /></dd>
                    </div>
                )}
                {loreDate?.isValid() && (
                    <div className={s.cell}>
                        <dt className={s.cellKey}>In-game date</dt>
                        <dd className={s.cellVal}>{loreDate.format('DD MMM YYYY').toUpperCase()}</dd>
                    </div>
                )}
                {operation.mapWorld && (
                    <div className={s.cell}>
                        <dt className={s.cellKey}>Map</dt>
                        <dd className={`${s.cellVal} ${s.cellValCaps}`}>{operation.mapWorld}</dd>
                    </div>
                )}
                {attendance.seats > 0 && (
                    <div className={s.cell}>
                        <dt className={s.cellKey}>Positions filled</dt>
                        <dd className={s.cellVal}>{attendance.filled} / {attendance.seats}</dd>
                    </div>
                )}
                <RsvpCell operationId={id} rsvpOpen={attendance.rsvpOpen} />
            </dl>

            {/* ── What you owe ───────────────────────────────────────────── */}
            {(showAcknowledgeCard || isLoggedIn) && (
                <div className={s.actions}>
                    {showAcknowledgeCard && (
                        <a className={s.ack} href='#acknowledge'>
                            <span className={s.ackText}>These orders need your acknowledgement</span>
                            <span className={s.ackGo}>Sign</span>
                        </a>
                    )}

                    {isLoggedIn && <AttendanceCall href={attendanceHref} attendance={attendance} />}
                </div>
            )}

            {/* ── Document ───────────────────────────────────────────────── */}
            <div className={s.body}>
                <OrdersSpine
                    operationId={id}
                    documents={documents}
                    activeDocument={activeDocument}
                    sections={onContent ? sections.map(sec => ({ id: sec.id, title: sec.title })) : []}
                    fromJ2={fromJ2}
                />

                <main className={s.reader}>
                    <div className={s.readerInner}>
                        {activeDocument === ZEUS && isJ6 && (
                            <ZeusNotesPanel operationId={id} initialNotes={operation.zeusNotes ?? ''} />
                        )}

                        {activeDocument === OCAP && hasOcap && (
                            <>
                                {isHQ && <OcapLinkPanel operationId={id} initialOcap={operation.ocap ?? null} />}
                                {isLoggedIn && !!operation.ocap?.playerStats?.length && (
                                    <OcapStatsPanel
                                        ocap={operation.ocap}
                                        themeColor={accent}
                                        r={rgb.r} g={rgb.g} b={rgb.b}
                                        pageTheme='modern'
                                        operationId={id}
                                    />
                                )}
                            </>
                        )}

                        {onContent && (
                            <>
                                <div className={s.readerTools}>
                                    {operation.ocap && (
                                        <a
                                            className={s.toolLink}
                                            href={operation.ocap.viewerUrl}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                        >
                                            OCAP Recording ↗
                                        </a>
                                    )}
                                    <PrintButton bgColor='#08090a' />
                                </div>

                                {sections.length > 0 ? (
                                    sections.map(sec => (
                                        <section
                                            key={sec.id}
                                            id={`section-${sec.id}`}
                                            data-print-section
                                            className={s.section}
                                        >
                                            <div className={s.sectionHead}>
                                                <div className={s.sectionHeadMain}>
                                                    <span className={s.sectionEyebrow}>{documentTitle}</span>
                                                    <h2 className={s.sectionTitle}>{sec.title}</h2>
                                                    <div className={s.sectionRule} />
                                                </div>
                                                {isLoggedIn && !sec.isPublic && (
                                                    <span className={s.classified}>Classified</span>
                                                )}
                                            </div>
                                            <DocBody content={sec.content ?? null} themeColor={accent} pageTheme='modern' />
                                        </section>
                                    ))
                                ) : operation.content ? (
                                    /* Legacy single-body operations, from before sections existed. */
                                    <section className={s.section} data-print-section>
                                        <div className={s.sectionHead}>
                                            <div className={s.sectionHeadMain}>
                                                <span className={s.sectionEyebrow}>{documentTitle}</span>
                                                <h2 className={s.sectionTitle}>Operation Orders</h2>
                                                <div className={s.sectionRule} />
                                            </div>
                                        </div>
                                        <DocBody content={operation.content} themeColor={accent} pageTheme='modern' />
                                    </section>
                                ) : (
                                    <p className={s.empty}>No orders have been written yet.</p>
                                )}

                                {showAcknowledgeCard && (
                                    <div id='acknowledge'>
                                        <DocAcknowledgeCard operationId={id} pageId='main' />
                                    </div>
                                )}

                                {hasHiddenSections && (
                                    <a className={s.locked} href={`/login?returnTo=/operations/${id}`}>
                                        <span className={s.lockedKey}>Information classified</span>
                                        <span className={s.lockedSub}>Log in to read the rest →</span>
                                    </a>
                                )}
                            </>
                        )}
                    </div>
                </main>
            </div>

            {isHQ && <EditOrdersButton operationId={id} themeColor={operation.themeColor} />}
        </div>
    )
}

/** The hero's lineage line, with separators only between the parts that exist. */
function Eyebrow({ parts }: { parts: (string | null | undefined)[] }) {
    const shown = parts.filter((p): p is string => !!p)
    if (!shown.length) return null

    return (
        <div className={s.heroEyebrow}>
            {shown.map((part, i) => (
                <span key={part} style={{ display: 'contents' }}>
                    {i > 0 && <span className={s.heroTick} />}
                    <span>{part}</span>
                </span>
            ))}
        </div>
    )
}

/**
 * The one control that replaced the attendance rail.
 *
 * It states the member's own position rather than the operation's numbers,
 * because the rail's headline figure ("0/72 assigned") answered a question
 * staff ask and members don't. What a member wants to know is whether they are
 * down for anything, and the answer is the label on the button.
 */
function AttendanceCall({ href, attendance }: { href: Route; attendance: ModernPageProps['attendance'] }) {
    const { myRsvp, myPosition, attending, rsvpOpen } = attendance

    const lede = myRsvp === 'not_attending'
        ? "You've said you're not attending"
        : myPosition
            ? `You're in — ${myPosition}`
            : myRsvp === 'attending'
                ? "You're attending, with no position yet"
                : rsvpOpen
                    ? 'You have not answered yet'
                    : 'Attendance'

    const action = myRsvp === 'not_attending'
        ? 'Change'
        : myPosition
            ? 'View board'
            : rsvpOpen
                ? 'Take a position'
                : 'View board'

    return (
        <Link className={s.cta} href={href}>
            <span>
                <span className={s.ctaLede}>{lede}</span>
                <span className={s.ctaSub}>
                    {attending} attending
                    {attendance.seats > 0 && ` · ${attendance.filled} of ${attendance.seats} positions filled`}
                </span>
            </span>
            <span className={s.ctaGo}>{action} →</span>
        </Link>
    )
}
