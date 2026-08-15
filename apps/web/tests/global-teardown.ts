import { rm } from 'fs/promises'
import type { MongoMemoryServer } from 'mongodb-memory-server'
import { BACKUPS_STORAGE_ROOT } from './constants'

export default async function globalTeardown(): Promise<void> {
    const mongo = (globalThis as { __ASOT_MONGO__?: MongoMemoryServer }).__ASOT_MONGO__
    if (mongo) await mongo.stop()
    await rm(BACKUPS_STORAGE_ROOT, { recursive: true, force: true }).catch(() => {})
}
