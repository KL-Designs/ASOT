'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

import Button from '@/components/ui/Button'
import EnlistButton from '@/components/ui/EnlistButton'
import Pulse from '@/components/ui/Pulse'
import { Kicker } from '@/components/ui/SectionHead'
import { ArrowIcon, DiscordIcon } from '@/components/ui/icons'

import FireEmbers from '@/components/fire-embers'
import MilitaryGrid from '@/components/military-grid'
import PhysicsGame from '@/components/physics-game'
import MinigameScoreboard from '@/components/minigame-scoreboard'

import Wordmark from '@/public/ASOT.svg'
import Banner from '@/public/images/home/PHQ2.png'
import s from '@/styles/landing.module.css'

/**
 * The hero — variant A, "overlay".
 *
 * Copy sits lower-left over the photograph rather than centred on top of it,
 * so the most interesting part of the frame stays visible — the old hero put
 * the logo squarely on top of the best part of the frame.
 *
 * The physics minigame lives here as it did before — it fades the copy out
 * while active, so the two never compete for the same space. The `id10t`
 * keyboard easter egg is preserved with it.
 */
export default function Hero({ sotm, roster, opCard }: {
    sotm: ScreenshotOfMonth | null
    roster: number | null
    /** Rendered server-side and passed in, so the card doesn't join the client bundle. */
    opCard: React.ReactNode
}) {
    const ref = useRef<HTMLDivElement>(null)

    const [keys, setKeys] = useState('')
    const [gameActive, setGameActive] = useState(false)
    const [gameDead, setGameDead] = useState(false)
    const [currentUser, setCurrentUser] = useState<User | null>(null)
    const [scoreboardKey, setScoreboardKey] = useState(0)

    const [lastScore, setLastScore] = useState<{ score: number, collectScore: number } | undefined>(undefined)
    const [globalBest, setGlobalBest] = useState<number | undefined>(undefined)
    const [globalBestName, setGlobalBestName] = useState<string | undefined>(undefined)
    const [personalBest, setPersonalBest] = useState<number | undefined>(undefined)

    useEffect(() => { ref.current?.focus({ preventScroll: true }) }, [])

    useEffect(() => {
        if (keys.toLocaleLowerCase() === 'id10t') window.location.href = 'https://www.youtube.com/watch?v=xvFZjo5PgG0'
    }, [keys])

    useEffect(() => {
        fetch('/api/me').then(r => r.json())
            .then(data => { if (!data.error) setCurrentUser(data) })
            .catch(() => { })
    }, [])

    useEffect(() => {
        fetch('/api/minigame/score').then(r => r.json())
            .then((scores: { userId: string, displayName: string, total: number }[]) => {
                if (scores.length > 0) { setGlobalBest(scores[0].total); setGlobalBestName(scores[0].displayName) }
            }).catch(() => { })
    }, [scoreboardKey])

    useEffect(() => {
        if (!currentUser) return
        fetch('/api/minigame/score?all=true').then(r => r.json())
            .then((scores: { userId: string, total: number }[]) => {
                setPersonalBest(scores.find(sc => sc.userId === currentUser.id)?.total)
            }).catch(() => { })
    }, [currentUser, scoreboardKey])

    function handleGameOver(score: number, collectScore: number) {
        setLastScore({ score, collectScore })
        setGameDead(true)
        if (!currentUser) return
        fetch('/api/minigame/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score, collectScore }),
        }).then(() => setScoreboardKey(k => k + 1)).catch(() => { })
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (e.key === 'Shift') return
        if (e.key === 'Backspace') return setKeys('')
        setKeys(keys + e.key)
    }

    return (
        <section className={s.hero} ref={ref} tabIndex={0} onKeyDown={handleKeyDown}>
            <div className={s.heroBg}>
                {sotm
                    ? <img src='/api/gallery/sotm/image' alt={`Screenshot of the Month — ${sotm.credit}`} />
                    : <Image src={Banner} alt='' fill style={{ objectFit: 'cover' }} priority />}
            </div>

            {/* A faint survey grid rather than the topo field. Over a photograph
                the contours competed with what was already in the frame; the
                grid sits behind it as a graticule instead of a second texture.
                The topo still runs on the flat bands further down the page. */}
            <MilitaryGrid gradient style={{ zIndex: 3 }} />
            <div className={`${s.heroVeil} ${opCard ? '' : s.heroVeilSolo}`} />

            <FireEmbers />
            <PhysicsGame
                onActivate={() => setGameActive(true)}
                onGameOver={handleGameOver}
                onRestart={() => setGameDead(false)}
                active={gameActive}
                personalBest={personalBest}
                globalBest={globalBest}
                globalBestName={globalBestName}
                liveUserId={currentUser?.id}
                liveAccentColor={currentUser?.hexAccentColor}
            />
            <MinigameScoreboard
                visible={gameDead}
                currentUserId={currentUser?.id}
                refreshKey={scoreboardKey}
                lastScore={lastScore}
            />

            <div
                className={`${s.heroInner} ${opCard ? '' : s.heroInnerSolo}`}
                style={{
                    opacity: gameActive ? 0 : 1,
                    transition: 'opacity 0.6s ease',
                    pointerEvents: gameActive ? 'none' : 'auto',
                }}
            >
                <div className={s.heroCopy}>
                    <Kicker>Est. 2019 · Oceania&apos;s largest ArmA 3 milsim unit</Kicker>

                    {/* The unit lockup as a vector — emblem and wordmark are one
                        asset, so they can never drift apart or fall out of
                        alignment as the hero scales. */}
                    <h1 className={s.heroMark}>
                        <Image src={Wordmark} alt='ASOT' priority />
                    </h1>

                    {/* No subtitle line: the lockup already carries "Australian
                        Special Operations Taskforce" under the wordmark, and
                        printing it again directly beneath was the loudest thing
                        wrong with the hero. The rule moves onto the paragraph. */}
                    <p className={`${s.heroP} ${s.heroPLead}`}>
                        Two operations a week, 50+ players on the field, and a rank structure that
                        actually means something. Combined arms across infantry, armour, rotary and
                        support — run by people who care about getting it right.
                    </p>

                    <div className={s.heroCta}>
                        <EnlistButton>Enlist now <ArrowIcon /></EnlistButton>
                        <Button variant='discord' href='https://discord.gg/asot' external>
                            <DiscordIcon /> Join Discord
                        </Button>
                    </div>

                    <div className={s.heroFacts}>
                        {roster != null && <span><Pulse /> <b>{roster}</b> active members</span>}
                        <span><b>2</b> ops per week</span>
                        <span><b>Applications open</b></span>
                    </div>
                </div>

                {opCard}
            </div>

            {sotm && (
                <div className={s.heroCredit}>
                    <span className={s.tag}>Screenshot of the month</span>
                    <span className={s.dot} />
                    <span>{sotm.credit}</span>
                    {sotm.operationTitle && <><span className={s.dot} /><span>{sotm.operationTitle}</span></>}
                    <span className={s.dot} />
                    <span>{new Date(sotm.dateTaken).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className={s.cue}>Scroll <i /></span>
                </div>
            )}
        </section>
    )
}
