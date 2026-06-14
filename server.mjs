/**
 * Custom Next.js server that co-hosts the Hocuspocus collab WebSocket server
 * on the same port under the /collab path.
 *
 * Production: node server.mjs
 * The collab server is no longer a separate process or port.
 */

import { createServer } from 'http'
import { parse } from 'url'
import { readdirSync, unlinkSync, existsSync, statSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import next from 'next'
import { Hocuspocus } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { MongoClient, ObjectId } from 'mongodb'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { WebSocketServer } from 'ws'

const dev  = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT || 3000)

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(node) {
    if (!node) return ''
    if (node.type === 'text') return node.text || ''
    if (Array.isArray(node.content)) return node.content.map(extractText).join(' ')
    return ''
}

// ── MongoDB ───────────────────────────────────────────────────────────────────

const mongoClient = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/ASOT')
await mongoClient.connect()
console.log('[collab] MongoDB connected')

const db = mongoClient.db(process.env.MONGO_DB || 'test')
const operations = db.collection('operations')
const activityLogs = db.collection('operation_activity')
const sopsCollection = db.collection('sops')
const workspaceDocsCollection = db.collection('workspace_docs')
console.log(`[collab] MongoDB db=${db.databaseName} collection=operations`)

// ── Activity tracking ─────────────────────────────────────────────────────────

function extractPlainText(node) {
    if (!node) return ''
    if (node.type === 'text') return node.text || ''
    if (!Array.isArray(node.content)) return ''
    const blockTypes = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'listItem'])
    const sep = blockTypes.has(node.type) ? '\n' : ''
    return node.content.map(extractPlainText).join(sep)
}

function extractSectionTexts(document) {
    const order = document.getArray('sectionOrder').toArray()
    const result = new Map()
    for (const sectionId of order) {
        const smeta = document.getMap('smeta-' + sectionId)
        const title = smeta.get('title') || sectionId
        let text = ''
        try {
            const content = yDocToProsemirrorJSON(document, 'scontent-' + sectionId)
            text = extractPlainText(content).trim()
        } catch {}
        result.set(sectionId, { title, text })
    }
    return result
}

// docName -> { lastFlushedText: Map, timer: Timeout|null, lastUser: object|null }
const activityState = new Map()

async function flushActivity(documentName, document) {
    const state = activityState.get(documentName)
    if (!state) return
    state.timer = null
    try {
        const currentTexts = extractSectionTexts(document)
        const entries = []
        const opId = new ObjectId(documentName)
        for (const [sectionId, { title, text }] of currentTexts) {
            const before = state.lastFlushedText.get(sectionId)?.text ?? ''
            if (before !== text) {
                entries.push({
                    operationId: opId,
                    sectionId,
                    sectionTitle: title,
                    userId: state.lastUser?.userId || null,
                    userName: state.lastUser?.userName || 'Unknown',
                    userAvatar: state.lastUser?.userAvatar || null,
                    timestamp: new Date(),
                    before,
                    after: text,
                })
            }
        }
        if (entries.length > 0) {
            await activityLogs.insertMany(entries)
            console.log(`[collab] activity flush doc=${documentName} sections=${entries.length}`)
        }
        state.lastFlushedText = currentTexts
    } catch (e) {
        console.error(`[collab] activity flush ERR doc=${documentName}`, e.message)
    }
}

// ── Hocuspocus ────────────────────────────────────────────────────────────────
// We don't call server.listen() — connections are fed in via the upgrade hook.

const collab = new Hocuspocus({
    async onAuthenticate({ token, documentName }) {
        // Auth callback hits our own Next.js API over loopback; pass documentName so
        // the route can apply different permission checks (e.g. sop-* docs allow all members)
        const res = await fetch(`http://localhost:${port}/api/auth/collab?doc=${encodeURIComponent(documentName ?? '')}`, {
            headers: { 'x-collab-token': token ?? '' },
        })
        const json = await res.json()
        if (!json.authorized) {
            console.log(`[collab] AUTH DENIED  token=${token?.slice(0, 8)}…`)
            throw new Error('Unauthorized')
        }
        console.log(`[collab] AUTH OK      token=${token?.slice(0, 8)}…  user=${json.userName}`)
        return { userId: json.userId, userName: json.userName, userAvatar: json.userAvatar }
    },

    async onConnect({ documentName }) {
        console.log(`[collab] ++ connected   doc=${documentName}`)
    },

    async onLoadDocument({ documentName, document }) {
        console.log(`[collab] >> load        doc=${documentName}`)
        if (documentName.startsWith('sop-') || documentName.startsWith('ws-')) return  // SOPs + workspace docs don't use activity tracking
        const existing = activityState.get(documentName)
        if (existing?.timer) {
            clearTimeout(existing.timer)
            await flushActivity(documentName, document)
        }
        activityState.set(documentName, {
            lastFlushedText: extractSectionTexts(document),
            timer: null,
            lastUser: null,
        })
    },

    async onChange({ documentName, document, context }) {
        if (documentName.startsWith('sop-') || documentName.startsWith('ws-')) return  // SOPs + workspace docs don't use activity tracking
        let state = activityState.get(documentName)
        if (!state) {
            state = { lastFlushedText: extractSectionTexts(document), timer: null, lastUser: null }
            activityState.set(documentName, state)
        }
        if (context?.userName) state.lastUser = context
        if (state.timer) clearTimeout(state.timer)
        state.timer = setTimeout(() => flushActivity(documentName, document), 15_000)
    },

    async onDisconnect({ documentName, document }) {
        console.log(`[collab] -- disconnected doc=${documentName}`)
        const state = activityState.get(documentName)
        if (state) {
            if (state.timer) clearTimeout(state.timer)
            await flushActivity(documentName, document)
        }
    },

    extensions: [
        new Database({
            fetch: async ({ documentName }) => {
                try {
                    // SOP documents — prefixed "sop-{sopId}"
                    if (documentName.startsWith('sop-')) {
                        const sopId = documentName.slice(4)
                        const sop = await sopsCollection.findOne(
                            { _id: new ObjectId(sopId) },
                            { projection: { yjsState: 1 } }
                        )
                        if (sop?.yjsState) {
                            console.log(`[collab] DB fetch OK  doc=${documentName}  (${sop.yjsState.length} bytes)`)
                            return sop.yjsState.buffer
                        }
                        console.log(`[collab] DB fetch     doc=${documentName}  (no state — new sop)`)
                        return null
                    }

                    // Workspace documents — prefixed "ws-{docId}"
                    if (documentName.startsWith('ws-')) {
                        const docId = documentName.slice(3)
                        const wdoc = await workspaceDocsCollection.findOne(
                            { _id: new ObjectId(docId) },
                            { projection: { yjsState: 1 } }
                        )
                        if (wdoc?.yjsState) {
                            console.log(`[collab] DB fetch OK  doc=${documentName}  (${wdoc.yjsState.length} bytes)`)
                            return wdoc.yjsState.buffer
                        }
                        console.log(`[collab] DB fetch     doc=${documentName}  (no state — new workspace doc)`)
                        return null
                    }

                    // Map documents are named "{operationId}-map"
                    const isMap = documentName.endsWith('-map')
                    const opId = isMap ? documentName.slice(0, -4) : documentName
                    const field = isMap ? 'mapYjsState' : 'yjsState'

                    const op = await operations.findOne(
                        { _id: new ObjectId(opId) },
                        { projection: { [field]: 1 } },
                    )
                    if (op?.[field]) {
                        console.log(`[collab] DB fetch OK  doc=${documentName}  (${op[field].length} bytes)`)
                        return op[field].buffer
                    }
                    console.log(`[collab] DB fetch     doc=${documentName}  (no state — new doc)`)
                    return null
                } catch (e) {
                    console.error(`[collab] DB fetch ERR doc=${documentName}`, e.message)
                    return null
                }
            },

            store: async ({ documentName, state, document }) => {
                console.log(`[collab] DB store     doc=${documentName}  (${state.length} bytes) — attempting…`)
                try {
                    // SOP documents — just persist the raw Yjs state and update timestamp
                    if (documentName.startsWith('sop-')) {
                        const sopId = documentName.slice(4)
                        const result = await sopsCollection.updateOne(
                            { _id: new ObjectId(sopId) },
                            { $set: { yjsState: state, updatedAt: new Date() } }
                        )
                        if (result.matchedCount === 0) {
                            console.warn(`[collab] DB store WARN doc=${documentName}  no SOP matched`)
                        } else {
                            console.log(`[collab] DB store OK  doc=${documentName}  (sop state)`)
                        }
                        return
                    }

                    // Workspace documents — persist Yjs state + update lastModifiedAt
                    if (documentName.startsWith('ws-')) {
                        const docId = documentName.slice(3)
                        const result = await workspaceDocsCollection.updateOne(
                            { _id: new ObjectId(docId) },
                            { $set: { yjsState: state, lastModifiedAt: new Date() } }
                        )
                        if (result.matchedCount === 0) {
                            console.warn(`[collab] DB store WARN doc=${documentName}  no workspace doc matched`)
                        } else {
                            console.log(`[collab] DB store OK  doc=${documentName}  (workspace doc state)`)
                        }
                        return
                    }

                    // Map documents — just persist the raw Yjs state
                    if (documentName.endsWith('-map')) {
                        const opId = documentName.slice(0, -4)
                        const result = await operations.updateOne(
                            { _id: new ObjectId(opId) },
                            { $set: { mapYjsState: state } },
                        )
                        if (result.matchedCount === 0) {
                            console.warn(`[collab] DB store WARN doc=${documentName}  no document matched`)
                        } else {
                            console.log(`[collab] DB store OK  doc=${documentName}  (map state)`)
                        }
                        return
                    }

                    const pageOrder = document.getArray('pageOrder').toArray()
                    const sectionOrder = document.getArray('sectionOrder').toArray()
                    let updateFields

                    if (pageOrder.length > 0) {
                        // Multi-page document
                        function readPageSections(pageId) {
                            const isMain = pageId === 'main'
                            const orderKey = isMain ? 'sectionOrder' : `sectionOrder-${pageId}`
                            return document.getArray(orderKey).toArray().map(sid => {
                                const metaKey = isMain ? `smeta-${sid}` : `smeta-${pageId}-${sid}`
                                const contentKey = isMain ? `scontent-${sid}` : `scontent-${pageId}-${sid}`
                                const meta = document.getMap(metaKey)
                                let content = null
                                try { content = yDocToProsemirrorJSON(document, contentKey) } catch {}
                                return { id: sid, title: meta.get('title') || '', isPublic: meta.get('isPublic') !== 'false', content }
                            })
                        }
                        const pages = pageOrder.map(pageId => {
                            const isMain = pageId === 'main'
                            const pmeta = document.getMap('pmeta-' + pageId)
                            return {
                                id: pageId,
                                isMain,
                                title: pmeta.get('title') || (isMain ? '1-0 HQ Orders' : 'Untitled'),
                                sections: readPageSections(pageId),
                            }
                        })
                        const mainSections = pages.find(p => p.isMain)?.sections ?? []
                        const extraPageSections = Object.fromEntries(
                            pages.filter(p => !p.isMain).map(p => [p.id, p.sections])
                        )
                        updateFields = {
                            yjsState: state,
                            sections: mainSections,
                            pages: pages.map(({ id, title, isMain }) => ({ id, title, isMain })),
                            extraPageSections,
                        }
                        const text = mainSections.map(s => `[${s.title}] ${extractText(s.content)}`).join(' | ')
                        console.log(`[collab] DB store     doc=${documentName}  pages=${pages.length}  main-sections=${mainSections.length}`)
                        console.log(`[collab] content      ${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`)
                    } else if (sectionOrder.length > 0) {
                        // Multi-section document (single page)
                        const sections = sectionOrder.map(sid => {
                            const meta = document.getMap('smeta-' + sid)
                            let content = null
                            try { content = yDocToProsemirrorJSON(document, 'scontent-' + sid) } catch {}
                            return {
                                id: sid,
                                title: meta.get('title') || '',
                                isPublic: meta.get('isPublic') !== 'false',
                                content,
                            }
                        })
                        updateFields = { yjsState: state, sections }
                        const text = sections.map(s => `[${s.title}] ${extractText(s.content)}`).join(' | ')
                        console.log(`[collab] DB store     doc=${documentName}  sections=${sections.length}`)
                        console.log(`[collab] content      ${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`)
                    } else {
                        // Legacy single-body document
                        const content = yDocToProsemirrorJSON(document, 'default')
                        updateFields = { yjsState: state, content }
                        const text = extractText(content)
                        console.log(`[collab] DB store     doc=${documentName}  (legacy single-body, nodes=${content?.content?.length ?? 0})`)
                        console.log(`[collab] content      ${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`)
                    }

                    const result = await operations.updateOne(
                        { _id: new ObjectId(documentName) },
                        { $set: updateFields },
                    )
                    if (result.matchedCount === 0) {
                        console.warn(`[collab] DB store WARN doc=${documentName}  no document matched — _id may be wrong`)
                    } else {
                        console.log(`[collab] DB store OK  doc=${documentName}  matched=${result.matchedCount} modified=${result.modifiedCount}`)
                    }
                } catch (e) {
                    console.error(`[collab] DB store ERR doc=${documentName}  ${e.message}`, e.stack)
                }
            },
        }),
    ],
})

// ── WebSocket server (noServer — attached to the HTTP server below) ───────────

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws, req) => collab.handleConnection(ws, req))

// ── Recruit Session WebSocket ─────────────────────────────────────────────────
// In-memory store: sessionId -> { recruiterWs, applicantWs, step, raisedHand, applicantLastActive, applicantCursor }

const recruitSessionWss = new WebSocketServer({ noServer: true })
const recruitActiveSessions = new Map()

function rssSend(ws, msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function rssGetOrCreate(sessionId, step = 1) {
    if (!recruitActiveSessions.has(sessionId)) {
        recruitActiveSessions.set(sessionId, {
            recruiterWs: null, applicantWs: null,
            step, raisedHand: false,
            applicantLastActive: null, applicantCursor: null,
            cache: {},
        })
    }
    return recruitActiveSessions.get(sessionId)
}

recruitSessionWss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const sessionId = url.searchParams.get('id')
    const role = url.searchParams.get('role')
    const token = url.searchParams.get('token')

    if (!sessionId || !role) { ws.close(1008, 'Missing parameters'); return }

    // Load session from DB
    const sessionDoc = await db.collection('recruit_sessions').findOne({ sessionId })
    if (!sessionDoc) { ws.close(1008, 'Session not found'); return }
    if (sessionDoc.expiresAt && new Date() > sessionDoc.expiresAt) {
        ws.close(1008, 'Session expired'); return
    }

    const mem = rssGetOrCreate(sessionId, sessionDoc.step)

    if (role === 'recruiter') {
        if (token !== sessionDoc.recruiterToken) { ws.close(1008, 'Invalid token'); return }

        // Close any existing recruiter connection
        if (mem.recruiterWs && mem.recruiterWs.readyState === 1) mem.recruiterWs.close()
        mem.recruiterWs = ws
        console.log(`[recruit-session] recruiter connected  session=${sessionId}`)

        // Send full state
        rssSend(ws, {
            type: 'state',
            step: mem.step,
            raisedHand: mem.raisedHand,
            applicantConnected: mem.applicantWs?.readyState === 1,
            applicantLastActive: mem.applicantLastActive,
        })

        ws.on('message', async (raw) => {
            let msg
            try { msg = JSON.parse(raw) } catch { return }

            if (msg.type === 'step' && typeof msg.step === 'number') {
                mem.step = msg.step
                rssSend(mem.applicantWs, { type: 'step', step: msg.step })
                // Persist step to DB
                db.collection('recruit_sessions').updateOne(
                    { sessionId },
                    { $set: { step: msg.step, lastActivity: new Date() } }
                ).catch(() => {})
            } else if (msg.type === 'lower-hand') {
                mem.raisedHand = false
                rssSend(mem.applicantWs, { type: 'hand', value: false })
                db.collection('recruit_sessions').updateOne(
                    { sessionId },
                    { $set: { raisedHand: false } }
                ).catch(() => {})
            } else if (msg.type === 'intro-sub') {
                const payload = { warmWelcome: !!msg.warmWelcome, processExplained: !!msg.processExplained, backgroundExplained: !!msg.backgroundExplained, valuesExplained: !!msg.valuesExplained }
                mem.cache.introSub = payload
                rssSend(mem.applicantWs, { type: 'intro-sub', ...payload })
            } else if (msg.type === 'name-preview') {
                mem.cache.namePreview = msg.name ?? ''
                mem.cache.nameStatus = msg.nameStatus ?? 'idle'
                mem.cache.nameOffensive = !!msg.nameOffensive
                mem.cache.nameSimilar = Array.isArray(msg.nameSimilar) ? msg.nameSimilar : []
                rssSend(mem.applicantWs, { type: 'name-preview', name: msg.name ?? '', nameStatus: mem.cache.nameStatus, nameOffensive: mem.cache.nameOffensive, nameSimilar: mem.cache.nameSimilar })
            } else if (msg.type === 'bg-sub') {
                const payload = { ageConfirmed: !!msg.ageConfirmed, regionDiscussed: !!msg.regionDiscussed, armaOwnershipConfirmed: !!msg.armaOwnershipConfirmed, milsimDiscussed: !!msg.milsimDiscussed, unitsDiscussed: !!msg.unitsDiscussed, communityIssuesCompleted: !!msg.communityIssuesCompleted }
                mem.cache.bgSub = payload
                rssSend(mem.applicantWs, { type: 'bg-sub', ...payload })
            } else if (msg.type === 'field-preview') {
                if (!mem.cache.fields) mem.cache.fields = {}
                mem.cache.fields[msg.field] = msg.value ?? ''
                rssSend(mem.applicantWs, { type: 'field-preview', field: msg.field, value: msg.value ?? '' })
            } else if (msg.type === 'avail-preview') {
                const payload = { availableNights: msg.availableNights ?? '', opsPerMonth: msg.opsPerMonth ?? '' }
                mem.cache.availPreview = payload
                rssSend(mem.applicantWs, { type: 'avail-preview', ...payload })
            } else if (msg.type === 'roles-preview') {
                const payload = { primaryRole: msg.primaryRole ?? '', additionalRoles: Array.isArray(msg.additionalRoles) ? msg.additionalRoles : [], departmentInterest: Array.isArray(msg.departmentInterest) ? msg.departmentInterest : [] }
                mem.cache.rolesPreview = payload
                rssSend(mem.applicantWs, { type: 'roles-preview', ...payload })
            } else if (msg.type === 'rules-question') {
                mem.cache.rulesQuestionIndex = typeof msg.questionIndex === 'number' ? msg.questionIndex : 0
                rssSend(mem.applicantWs, { type: 'rules-question', questionIndex: mem.cache.rulesQuestionIndex })
            } else if (msg.type === 'orbat-highlight') {
                mem.cache.orbatHighlight = msg.platoon ?? null
                rssSend(mem.applicantWs, { type: 'orbat-highlight', platoon: msg.platoon ?? null })
            } else if (msg.type === 'orbat-subview') {
                mem.cache.orbatSubView = msg.subView ?? 'main'
                rssSend(mem.applicantWs, { type: 'orbat-subview', subView: msg.subView ?? 'main' })
            } else if (msg.type === 'recruiter-cursor') {
                // Forward recruiter's cursor position to applicant (only on step 9 / BCT calendar)
                rssSend(mem.applicantWs, { type: 'recruiter-cursor', x: msg.x, y: msg.y })
            } else if (msg.type === 'bct-quiz-mode') {
                mem.cache.bctQuizMode = !!msg.isQuiz
                rssSend(mem.applicantWs, { type: 'bct-quiz-mode', isQuiz: mem.cache.bctQuizMode })
            } else if (msg.type === 'bct-slot-added' && msg.slot) {
                if (!mem.cache.bctSlots) mem.cache.bctSlots = []
                // Replace existing slot for same date or append
                const idx = mem.cache.bctSlots.findIndex(s => s.id === msg.slot.id || s.date === msg.slot.date)
                if (idx >= 0) mem.cache.bctSlots[idx] = msg.slot
                else mem.cache.bctSlots.push(msg.slot)
                rssSend(mem.applicantWs, { type: 'bct-slots', slots: mem.cache.bctSlots })
            } else if (msg.type === 'ts-link-status') {
                mem.cache.tsLinkStatus = msg.status ?? 'idle'
                rssSend(mem.applicantWs, { type: 'ts-link-status', status: msg.status ?? 'idle' })
            } else if (msg.type === 'ping') {
                rssSend(ws, { type: 'pong' })
            }
        })

        ws.on('close', () => {
            console.log(`[recruit-session] recruiter disconnected  session=${sessionId}`)
            mem.recruiterWs = null
            rssSend(mem.applicantWs, { type: 'recruiter-disconnected' })
        })

    } else if (role === 'applicant') {
        // Close any existing applicant connection
        if (mem.applicantWs && mem.applicantWs.readyState === 1) mem.applicantWs.close()
        mem.applicantWs = ws
        console.log(`[recruit-session] applicant connected   session=${sessionId}`)

        // Notify recruiter
        rssSend(mem.recruiterWs, { type: 'applicant-connected' })

        // Send full state
        rssSend(ws, {
            type: 'state',
            step: mem.step,
            raisedHand: mem.raisedHand,
            recruiterConnected: mem.recruiterWs?.readyState === 1,
        })

        // Replay cached live preview so applicant sees current state immediately
        const c = mem.cache
        if (c.namePreview !== undefined) rssSend(ws, { type: 'name-preview', name: c.namePreview, nameStatus: c.nameStatus ?? 'idle', nameOffensive: !!c.nameOffensive, nameSimilar: c.nameSimilar ?? [] })
        if (c.introSub) rssSend(ws, { type: 'intro-sub', ...c.introSub })
        if (c.bgSub) rssSend(ws, { type: 'bg-sub', ...c.bgSub })
        if (c.fields) {
            for (const [field, value] of Object.entries(c.fields)) {
                rssSend(ws, { type: 'field-preview', field, value })
            }
        }
        if (c.availPreview) rssSend(ws, { type: 'avail-preview', ...c.availPreview })
        if (c.rolesPreview) rssSend(ws, { type: 'roles-preview', ...c.rolesPreview })
        if (c.rulesQuestionIndex !== undefined) rssSend(ws, { type: 'rules-question', questionIndex: c.rulesQuestionIndex })
        if (c.orbatHighlight !== undefined) rssSend(ws, { type: 'orbat-highlight', platoon: c.orbatHighlight })
        if (c.orbatSubView !== undefined) rssSend(ws, { type: 'orbat-subview', subView: c.orbatSubView })
        if (c.bctSlots?.length) rssSend(ws, { type: 'bct-slots', slots: c.bctSlots })
        if (c.bctQuizMode !== undefined) rssSend(ws, { type: 'bct-quiz-mode', isQuiz: c.bctQuizMode })
        if (c.tsLinkStatus) rssSend(ws, { type: 'ts-link-status', status: c.tsLinkStatus })

        ws.on('message', (raw) => {
            let msg
            try { msg = JSON.parse(raw) } catch { return }

            if (msg.type === 'raise-hand') {
                mem.raisedHand = !!msg.value
                rssSend(mem.recruiterWs, { type: 'raised-hand', value: mem.raisedHand })
                db.collection('recruit_sessions').updateOne(
                    { sessionId },
                    { $set: { raisedHand: mem.raisedHand } }
                ).catch(() => {})
            } else if (msg.type === 'active') {
                mem.applicantLastActive = Date.now()
                rssSend(mem.recruiterWs, { type: 'applicant-active', lastActive: mem.applicantLastActive })
            } else if (msg.type === 'cursor') {
                mem.applicantCursor = { x: msg.x, y: msg.y }
                rssSend(mem.recruiterWs, { type: 'cursor', x: msg.x, y: msg.y })
            } else if (msg.type === 'rules-answer') {
                if (!mem.cache.rulesAnswers) mem.cache.rulesAnswers = {}
                mem.cache.rulesAnswers[msg.questionIndex] = !!msg.answer
                rssSend(mem.recruiterWs, { type: 'rules-answer', questionIndex: msg.questionIndex, answer: !!msg.answer })
                rssSend(ws, { type: 'rules-answer-ack', questionIndex: msg.questionIndex })
            } else if (msg.type === 'ts-link-request') {
                mem.cache.tsLinkStatus = 'pending'
                rssSend(mem.recruiterWs, { type: 'ts-link-request' })
                rssSend(ws, { type: 'ts-link-status', status: 'pending' })
            } else if (msg.type === 'ping') {
                rssSend(ws, { type: 'pong' })
            }
        })

        ws.on('close', () => {
            console.log(`[recruit-session] applicant disconnected session=${sessionId}`)
            mem.applicantWs = null
            mem.applicantCursor = null
            rssSend(mem.recruiterWs, { type: 'applicant-disconnected', lastActive: mem.applicantLastActive })
        })

    } else {
        ws.close(1008, 'Invalid role')
    }
})

// ── Next.js ───────────────────────────────────────────────────────────────────

const app    = next({ dev, port })
const handle = app.getRequestHandler()
await app.prepare()

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true))
})

httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url)
    if (pathname === '/collab') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request)
        })
    } else if (pathname === '/recruit-session') {
        recruitSessionWss.handleUpgrade(request, socket, head, (ws) => {
            recruitSessionWss.emit('connection', ws, request)
        })
    }
    // Other paths (e.g. /_next/webpack-hmr) are handled by Next.js itself
})

// ── Storage directory initialisation ─────────────────────────────────────────
// Creates the structured storage/ tree on startup if any folder is missing.

;['j1','j2','j3','j4','j5','j6','j7','hq','all','members'].forEach(d =>
    mkdirSync(resolve(`./storage/${d}`), { recursive: true })
)

// ── Operation image cleanup ───────────────────────────────────────────────────

const UPLOADS_DIR = resolve('./uploads/operations')
const IMAGE_URL_PREFIX = '/api/operations/image'

function urlToFilename(src) {
    try {
        const url = new URL(src, 'http://localhost')
        if (!url.pathname.startsWith(IMAGE_URL_PREFIX)) return null
        const id = url.searchParams.get('id')
        const ext = url.searchParams.get('ext') || 'jpg'
        if (!id) return null
        return `${id}.${ext}`
    } catch { return null }
}

function collectImageSrcs(node, out) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'image' && typeof node.attrs?.src === 'string') out.add(node.attrs.src)
    if (Array.isArray(node.content)) node.content.forEach(c => collectImageSrcs(c, out))
}

async function cleanupOperationImages() {
    const referencedFiles = new Set()
    const ops = await operations.find({}).toArray()

    for (const op of ops) {
        if (op.coverImage) {
            const f = urlToFilename(op.coverImage)
            if (f) referencedFiles.add(f)
        }
        for (const section of (op.sections ?? [])) {
            const srcs = new Set()
            collectImageSrcs(section.content, srcs)
            srcs.forEach(src => { const f = urlToFilename(src); if (f) referencedFiles.add(f) })
        }
        for (const pageSections of Object.values(op.extraPageSections ?? {})) {
            for (const section of pageSections) {
                const srcs = new Set()
                collectImageSrcs(section.content, srcs)
                srcs.forEach(src => { const f = urlToFilename(src); if (f) referencedFiles.add(f) })
            }
        }
        if (op.content) {
            const srcs = new Set()
            collectImageSrcs(op.content, srcs)
            srcs.forEach(src => { const f = urlToFilename(src); if (f) referencedFiles.add(f) })
        }
    }

    if (!existsSync(UPLOADS_DIR)) return
    const diskFiles = readdirSync(UPLOADS_DIR)
    const TWO_HOURS = 2 * 60 * 60 * 1000
    let deleted = 0
    for (const file of diskFiles) {
        if (!referencedFiles.has(file)) {
            const { mtimeMs } = statSync(join(UPLOADS_DIR, file))
            if (Date.now() - mtimeMs > TWO_HOURS) {
                unlinkSync(join(UPLOADS_DIR, file))
                deleted++
            }
        }
    }

    if (deleted > 0) {
        console.log(`[image-cleanup] Removed ${deleted} orphaned image(s). ${referencedFiles.size} in use across ${ops.length} operation(s).`)
    } else {
        console.log(`[image-cleanup] No orphaned images. ${referencedFiles.size} in use across ${ops.length} operation(s).`)
    }
}

cleanupOperationImages().catch(e => console.error('[image-cleanup] Error:', e.message))
setInterval(() => cleanupOperationImages().catch(e => console.error('[image-cleanup] Error:', e.message)), 60 * 60 * 1000)

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`> Next.js ready on http://0.0.0.0:${port}`)
    console.log(`> Collab WebSocket on ws://0.0.0.0:${port}/collab`)
})

// ── Calendar reminders cron (every 1 minute) ─────────────────────────────────

async function triggerCalendarRemindersCron() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/calendar-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
        if (!res.ok) {
            console.error(`[cron/calendar-reminders] HTTP ${res.status} — check CRON_SECRET`)
            return
        }
        const data = await res.json()
        console.log(`[cron/calendar-reminders] tick — fired=${data.fired ?? 0}`)
    } catch (e) {
        console.error('[cron/calendar-reminders] Error:', e.message)
    }
}

setInterval(triggerCalendarRemindersCron, 60 * 1000)
triggerCalendarRemindersCron()

// ── Task reminders / overdue / escalation cron (every 1 minute) ──────────────

async function triggerTaskRemindersCron() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/task-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
        if (!res.ok) {
            console.error(`[cron/task-reminders] HTTP ${res.status} — check CRON_SECRET`)
            return
        }
        const data = await res.json()
        const { remindersFired, overdueFired, escalationsFired } = data
        if (remindersFired + overdueFired + escalationsFired > 0) {
            console.log(`[cron/task-reminders] tick — reminders=${remindersFired} overdue=${overdueFired} escalations=${escalationsFired}`)
        }
    } catch (e) {
        console.error('[cron/task-reminders] Error:', e.message)
    }
}

setInterval(triggerTaskRemindersCron, 60 * 1000)
triggerTaskRemindersCron()

// ── Operations cron (every 1 minute) ─────────────────────────────────────────

async function triggerOperationsCron() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/operations`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
        if (!res.ok) {
            console.error(`[cron/operations] HTTP ${res.status} — check CRON_SECRET`)
            return
        }
        const data = await res.json()
        const { rsvpOpened, rsvpClosed, activatedOps, confirmationOpened, confirmationClosed } = data
        const summary = `rsvpOpened=${rsvpOpened} rsvpClosed=${rsvpClosed} activatedOps=${activatedOps} confirmationOpened=${confirmationOpened} confirmationClosed=${confirmationClosed}`
        console.log(`[cron/operations] tick — ${summary}`)
    } catch (e) {
        console.error('[cron/operations] Error:', e.message)
    }
}

setInterval(triggerOperationsCron, 60 * 1000)
triggerOperationsCron()

// ── Dev check escalation cron (every 1 hour) ─────────────────────────────────

async function triggerDevCheckEscalationCron() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/dev-check-escalation`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
        if (!res.ok) {
            console.error(`[cron/dev-check-escalation] HTTP ${res.status} — check CRON_SECRET`)
            return
        }
        const data = await res.json()
        if (data.escalated > 0 || data.errors > 0) {
            console.log(`[cron/dev-check-escalation] tick — escalated=${data.escalated} errors=${data.errors}`)
        }
    } catch (e) {
        console.error('[cron/dev-check-escalation] Error:', e.message)
    }
}

setInterval(triggerDevCheckEscalationCron, 60 * 60 * 1000)
triggerDevCheckEscalationCron()

// ── Snapshot scheduler (every 2 days at 3am) ──────────────────────────────────

function msUntilNext3am() {
    const now = new Date()
    const next = new Date(now)
    next.setHours(3, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    return next.getTime() - now.getTime()
}

async function triggerScheduledSnapshot() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/snapshots`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
        const data = await res.json()
        console.log('[snapshots] Scheduled snapshot triggered:', data)
    } catch (e) {
        console.error('[snapshots] Scheduled snapshot error:', e.message)
    }
}

setTimeout(() => {
    triggerScheduledSnapshot()
    setInterval(triggerScheduledSnapshot, 48 * 60 * 60 * 1000)
}, msUntilNext3am())
console.log(`[snapshots] Next auto-snapshot in ${Math.round(msUntilNext3am() / 1000 / 60)} minutes`)

// ── TeamSpeak daily snapshot (every 24h at 3am) ───────────────────────────────

async function triggerTsSnapshot() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/teamspeak-snapshots`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
        const data = await res.json()
        console.log('[teamspeak-snapshots] Daily snapshot triggered:', data)
    } catch (e) {
        console.error('[teamspeak-snapshots] Error:', e.message)
    }
}

setTimeout(() => {
    triggerTsSnapshot()
    setInterval(triggerTsSnapshot, 24 * 60 * 60 * 1000)
}, msUntilNext3am())

// ── TeamSpeak offline client cache (refresh every 15 min) ────────────────────

async function triggerTsCacheRefresh() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/teamspeak-cache`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
        const data = await res.json()
        console.log('[teamspeak-cache] Refresh triggered:', data)
    } catch (e) {
        console.error('[teamspeak-cache] Error:', e.message)
    }
}

setInterval(triggerTsCacheRefresh, 15 * 60 * 1000)
triggerTsCacheRefresh()
