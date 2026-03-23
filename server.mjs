/**
 * Custom Next.js server that co-hosts the Hocuspocus collab WebSocket server
 * on the same port under the /collab path.
 *
 * Production: node server.mjs
 * The collab server is no longer a separate process or port.
 */

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Hocuspocus } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { MongoClient, ObjectId } from 'mongodb'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { WebSocketServer } from 'ws'

const dev  = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT || 3000)

// ── MongoDB ───────────────────────────────────────────────────────────────────

const mongoClient = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/ASOT')
await mongoClient.connect()
console.log('[collab] MongoDB connected')

const operations = mongoClient.db().collection('operations')

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
                try {
                    const content = yDocToProsemirrorJSON(document, 'default')
                    await operations.updateOne(
                        { _id: new ObjectId(documentName) },
                        { $set: { yjsState: state, content } },
                    )
                    console.log(`[collab] DB store OK  doc=${documentName}  (${state.length} bytes)`)
                } catch (e) {
                    console.error(`[collab] DB store ERR doc=${documentName}`, e.message)
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

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`> Next.js ready on http://0.0.0.0:${port}`)
    console.log(`> Collab WebSocket on ws://0.0.0.0:${port}/collab`)
})
