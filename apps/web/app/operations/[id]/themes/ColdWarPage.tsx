import dayjs from 'dayjs'
import Link from 'next/link'
import type { Route } from 'next'
import DocBody from '../doc-body'
import LocalDate from '../local-date'
import ZeusNotesPanel from '../ZeusNotesPanel'
import OcapLinkPanel from '../OcapLinkPanel'
import OcapStatsPanel from '../OcapStatsPanel'
import DocAcknowledgeCard from '../DocAcknowledgeCard'
import OperationBar from '../OperationBar'
import EditOrdersButton from '../EditOrdersButton'
import HideSiteNav from '@/components/HideSiteNav'
import FileTabs from './FileTabs'
import PaperRsvp from './PaperRsvp'
import type { SpineDocument } from './OrdersSpine'
import type { ModernPageProps } from './theme-props'
import s from './coldwar.module.css'

const ZEUS = '__zeus__'
const OCAP = '__ocap__'

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
    id, operation, isLoggedIn, isHQ, isJ6, showAcknowledgeCard,
    activePageParam, fromJ2, attendance, lineage,
}: ModernPageProps) {
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

    const rawSections = activeDocument === 'main'
        ? operation.sections ?? []
        : operation.extraPageSections?.[activeDocument] ?? operation.sections ?? []
    const readable = rawSections.filter(sec => isLoggedIn || sec.isPublic)

    const documentTitle = documents.find(doc => doc.id === activeDocument)?.title ?? 'Operation Orders'
    const loreDate = operation.loreDate ? dayjs(operation.loreDate) : null
    const attendanceHref = `/operations/${id}/attendance` as Route

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
            />

            <div className={s.desk}>
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
                            {activeDocument === ZEUS && isJ6 && (
                                <ZeusNotesPanel operationId={id} initialNotes={operation.zeusNotes ?? ''} />
                            )}
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
                            <div className={s.classification}>Secret — ASOT eyes only</div>

                            <header className={s.head}>
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
                            </header>

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
                                        <dt className={s.refKey}>Terrain</dt>
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

                            {operation.coverImage && (
                                <figure className={s.plate}>
                                    <img className={s.plateImg} src={operation.coverImage} alt='' />
                                    <figcaption className={s.plateCap}>
                                        Fig. 1 — {operation.mapWorld ? `${operation.mapWorld}, ` : ''}area of operations
                                    </figcaption>
                                </figure>
                            )}

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
                                                    ? <DocBody content={sec.content ?? null} themeColor={operation.themeColor || '#db001d'} pageTheme='coldwar' />
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
                                        <DocBody content={operation.content} themeColor={operation.themeColor || '#db001d'} pageTheme='coldwar' />
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

            {isHQ && <EditOrdersButton operationId={id} themeColor={operation.themeColor} />}
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
