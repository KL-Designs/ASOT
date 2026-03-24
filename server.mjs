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
console.log(`[collab] MongoDB db=${db.databaseName} collection=operations`)

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
        console.log(`[collab] AUTH OK      token=${token?.slice(0, 8)}…`)
    },

    async onConnect({ documentName }) {
        console.log(`[collab] ++ connected   doc=${documentName}`)
    },

    async onDisconnect({ documentName }) {
        console.log(`[collab] -- disconnected doc=${documentName}`)
    },

    extensions: [
        new Database({
            fetch: async ({ documentName }) => {
                try {
                    const op = await operations.findOne(
                        { _id: new ObjectId(documentName) },
                        { projection: { yjsState: 1 } },
                    )
                    if (op?.yjsState) {
                        console.log(`[collab] DB fetch OK  doc=${documentName}  (${op.yjsState.length} bytes)`)
                        return op.yjsState.buffer
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
                    const sectionOrder = document.getArray('sectionOrder').toArray()
                    let updateFields

                    if (sectionOrder.length > 0) {
                        // Multi-section document
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
