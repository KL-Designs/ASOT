/**
 * Custom Next.js server that co-hosts the Hocuspocus collab WebSocket server
 * on the same port under the /collab path.
 *
 * Production: node server.mjs
 * The collab server is no longer a separate process or port.
 */

import { createServer } from 'http'
import { parse } from 'url'
import { readdirSync, unlinkSync, existsSync, statSync } from 'fs'
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
    async onAuthenticate({ token }) {
        // Auth callback hits our own Next.js API over loopback
        const res = await fetch(`http://localhost:${port}/api/auth/collab`, {
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
    }
    // Other paths (e.g. /_next/webpack-hmr) are handled by Next.js itself
})

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
        const res = await fetch(`http://localhost:${port}/api/cron/calendar-reminders?secret=${process.env.CRON_SECRET}`)
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

// ── Operations cron (every 1 minute) ─────────────────────────────────────────

async function triggerOperationsCron() {
    try {
        const res = await fetch(`http://localhost:${port}/api/cron/operations?secret=${process.env.CRON_SECRET}`)
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
        const res = await fetch(`http://localhost:${port}/api/cron/snapshots?secret=${process.env.CRON_SECRET}`)
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
