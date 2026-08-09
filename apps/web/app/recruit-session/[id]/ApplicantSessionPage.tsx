'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ApplicantPageView from '@/app/recruit-session/ApplicantPageView'
import { type IntroProgress, type LivePreview } from '@/app/recruit-session/StepContent'
import TSLinkButton from '@/app/me/TSLinkButton'

const WS_URL = (process.env.NEXT_PUBLIC_BASEURL ?? '')
    .replace(/^http/, 'ws')
    .replace(/^https/, 'wss') + '/recruit-session'

interface Props {
    sessionId: string
    initialStep: number
    initialRaisedHand: boolean
    recruiterName: string
}

export default function ApplicantSessionPage({ sessionId, initialStep, initialRaisedHand, recruiterName }: Props) {
    const [step, setStep] = useState(initialStep)
    const [raisedHand, setRaisedHand] = useState(initialRaisedHand)
    const [connected, setConnected] = useState(false)
    const [recruiterOnline, setRecruiterOnline] = useState(false)

    const [introProgress, setIntroProgress] = useState<IntroProgress>({
        warmWelcome: false, processExplained: false,
        backgroundExplained: false, valuesExplained: false,
    })
    const [livePreview, setLivePreview] = useState<LivePreview>({})
    const [rulesAnswers, setRulesAnswers] = useState<Record<number, boolean | null>>({})
    const [meData, setMeData] = useState<{ tsLink?: { cldbid: number; linkedAt: number } | null } | null>(null)

    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const activeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
    const lastCursorSend = useRef(0)

    const onMouseMove = useCallback((e: MouseEvent) => {
        const now = Date.now()
        if (now - lastCursorSend.current < 80) return
        lastCursorSend.current = now
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'cursor',
                x: Math.round((e.clientX / window.innerWidth) * 100) / 100,
                y: Math.round((e.clientY / window.innerHeight) * 100) / 100,
            }))
        }
    }, [])

    function connect() {
        if (wsRef.current?.readyState === WebSocket.OPEN) return
        const ws = new WebSocket(`${WS_URL}?id=${sessionId}&role=applicant`)
        wsRef.current = ws

        ws.onopen = () => {
            setConnected(true)
            if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null }
        }

        ws.onmessage = (event) => {
            let msg: Record<string, unknown>
            try { msg = JSON.parse(event.data) } catch { return }

            if (msg.type === 'state') {
                if (typeof msg.step === 'number') setStep(msg.step)
                if (typeof msg.raisedHand === 'boolean') setRaisedHand(msg.raisedHand)
                if (msg.recruiterConnected) setRecruiterOnline(true)
            } else if (msg.type === 'step' && typeof msg.step === 'number') {
                setStep(msg.step)
            } else if (msg.type === 'hand') {
                setRaisedHand(!!msg.value)
            } else if (msg.type === 'recruiter-connected') {
                setRecruiterOnline(true)
            } else if (msg.type === 'recruiter-disconnected') {
                setRecruiterOnline(false)
            } else if (msg.type === 'intro-sub') {
                setIntroProgress({
                    warmWelcome: !!msg.warmWelcome,
                    processExplained: !!msg.processExplained,
                    backgroundExplained: !!msg.backgroundExplained,
                    valuesExplained: !!msg.valuesExplained,
                })
            } else if (msg.type === 'name-preview') {
                setLivePreview(p => ({
                    ...p,
                    namePreview: msg.name as string,
                    nameStatus: msg.nameStatus as LivePreview['nameStatus'] ?? 'idle',
                    nameOffensive: !!msg.nameOffensive,
                    nameSimilar: Array.isArray(msg.nameSimilar) ? msg.nameSimilar as string[] : [],
                }))
            } else if (msg.type === 'bg-sub') {
                setLivePreview(p => ({
                    ...p, bgProgress: {
                        ageConfirmed: !!msg.ageConfirmed,
                        regionDiscussed: !!msg.regionDiscussed,
                        armaOwnershipConfirmed: !!msg.armaOwnershipConfirmed,
                        milsimDiscussed: !!msg.milsimDiscussed,
                        unitsDiscussed: !!msg.unitsDiscussed,
                        communityIssuesCompleted: !!msg.communityIssuesCompleted,
                    },
                }))
            } else if (msg.type === 'field-preview') {
                setLivePreview(p => ({ ...p, [msg.field as string]: msg.value }))
            } else if (msg.type === 'avail-preview') {
                setLivePreview(p => ({ ...p, availableNights: msg.availableNights as string, opsPerMonth: msg.opsPerMonth as string }))
            } else if (msg.type === 'roles-preview') {
                setLivePreview(p => ({
                    ...p,
                    primaryRole: msg.primaryRole as string,
                    additionalRoles: msg.additionalRoles as string[],
                    departmentInterest: msg.departmentInterest as string[],
                }))
            } else if (msg.type === 'rules-question') {
                if (typeof msg.questionIndex === 'number') {
                    setLivePreview(p => ({ ...p, rulesQuestionIndex: msg.questionIndex as number }))
                }
            } else if (msg.type === 'rules-answer-ack') {
                // Server confirmed the answer was received
            } else if (msg.type === 'orbat-highlight') {
                setLivePreview(p => ({ ...p, orbatHighlight: msg.platoon as string | null }))
            } else if (msg.type === 'orbat-subview') {
                setLivePreview(p => ({ ...p, orbatSubView: msg.subView as LivePreview['orbatSubView'] }))
            } else if (msg.type === 'bct-quiz-mode') {
                setLivePreview(p => ({ ...p, isQuiz: !!msg.isQuiz }))
            } else if (msg.type === 'bct-slots') {
                setLivePreview(p => ({ ...p, bctSlots: msg.slots as LivePreview['bctSlots'] }))
            } else if (msg.type === 'recruiter-cursor') {
                setLivePreview(p => ({ ...p, recruiterCursorX: msg.x as number, recruiterCursorY: msg.y as number }))
            } else if (msg.type === 'ts-link-status') {
                setLivePreview(p => ({ ...p, tsLinkStatus: msg.status as LivePreview['tsLinkStatus'] }))
            }
        }

        ws.onclose = () => {
            setConnected(false)
            reconnectTimer.current = setTimeout(connect, 3000)
        }

        ws.onerror = () => ws.close()
    }

    function sendActive() {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'active' }))
        }
    }

    useEffect(() => {
        connect()
        activeTimer.current = setInterval(sendActive, 10_000)
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('keydown', sendActive)
        window.addEventListener('click', sendActive)
        // Fetch user data for TS link widget (succeeds only if logged in)
        fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => { if (d) setMeData(d) }).catch(() => {})
        return () => {
            wsRef.current?.close()
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
            if (activeTimer.current) clearInterval(activeTimer.current)
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('keydown', sendActive)
            window.removeEventListener('click', sendActive)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId])

    useEffect(() => {
        if (step !== 2) {
            setIntroProgress({ warmWelcome: false, processExplained: false, backgroundExplained: false, valuesExplained: false })
        }
    }, [step])

    function toggleHand() {
        const newVal = !raisedHand
        setRaisedHand(newVal)
        wsRef.current?.send(JSON.stringify({ type: 'raise-hand', value: newVal }))
    }

    function handleRulesAnswer(questionIndex: number, answer: boolean) {
        setRulesAnswers(prev => ({ ...prev, [questionIndex]: answer }))
        wsRef.current?.send(JSON.stringify({ type: 'rules-answer', questionIndex, answer }))
    }

    function handleTsLinked() {
        wsRef.current?.send(JSON.stringify({ type: 'ts-link-request' }))
        setLivePreview(p => ({ ...p, tsLinkStatus: 'linked' }))
    }

    // Show TSLinkButton if user is logged in, otherwise a fallback message
    const tsLinkWidget = meData ? (
        <TSLinkButton
            linked={meData.tsLink ?? null}
            expectedNickname={livePreview.namePreview ?? recruiterName}
            onLinked={handleTsLinked}
        />
    ) : (
        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
            Log in to the ASOT website to link your TeamSpeak account, or ask your recruiter to assist.
        </div>
    )

    return (
        <ApplicantPageView
            step={step}
            raisedHand={raisedHand}
            connected={connected}
            recruiterOnline={recruiterOnline}
            recruiterName={recruiterName}
            introProgress={introProgress}
            livePreview={livePreview}
            onToggleHand={toggleHand}
            onRulesAnswer={handleRulesAnswer}
            rulesAnswers={rulesAnswers}
            tsLinkWidget={tsLinkWidget}
        />
    )
}
