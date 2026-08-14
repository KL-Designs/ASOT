import type { MongoMemoryServer } from 'mongodb-memory-server'

export default async function globalTeardown(): Promise<void> {
    const mongo = (globalThis as { __ASOT_MONGO__?: MongoMemoryServer }).__ASOT_MONGO__
    if (mongo) await mongo.stop()
}
