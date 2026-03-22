import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { MongoClient, ObjectId } from 'mongodb'
import { yDocToProsemirrorJSON } from 'y-prosemirror'

const mongoClient = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/ASOT')
await mongoClient.connect()
console.log('[collab] Connected to MongoDB')

const operations = mongoClient.db().collection('operations')

const WEB_URL = process.env.WEB_URL || 'http://localhost:3000'

const server = new Server({
    port: Number(process.env.COLLAB_PORT || 1234),

    async onAuthenticate({ token }) {
        const res = await fetch(`${WEB_URL}/api/auth/collab`, {
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

    async onLoadDocument({ documentName }) {
        console.log(`[collab] >> load        doc=${documentName}`)
    },

    async onChange({ documentName }) {
        console.log(`[collab] ~~ change      doc=${documentName}`)
    },

    extensions: [
        new Database({
            // Load stored Yjs binary state for this document
            fetch: async ({ documentName }) => {
                try {
                    const op = await operations.findOne(
                        { _id: new ObjectId(documentName) },
                        { projection: { yjsState: 1 } }
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

            // Persist Yjs binary state + extract Tiptap JSON for the viewer
            store: async ({ documentName, state, document }) => {
                try {
                    const content = yDocToProsemirrorJSON(document, 'default')
                    await operations.updateOne(
                        { _id: new ObjectId(documentName) },
                        { $set: { yjsState: state, content } }
                    )
                    console.log(`[collab] DB store OK  doc=${documentName}  (${state.length} bytes)`)
                } catch (e) {
                    console.error(`[collab] DB store ERR doc=${documentName}`, e.message)
                }
            },
        }),
    ],
})

server.listen()
console.log(`[collab] Hocuspocus server listening on :${process.env.COLLAB_PORT || 1234}`)
