/**
 * Starts an in-memory mongod on a fixed port and seeds it.
 *
 * `mongodb-memory-server` downloads a real mongod binary on first run and
 * executes it — this is a genuine MongoDB, not a mock, so the app's queries,
 * upserts and `$or` lookups all behave exactly as they do in production.
 * No Docker required, which is what unblocked this suite.
 *
 * The port is fixed (see constants.ts) rather than auto-allocated so that
 * `playwright.config.ts` can bake MONGO_URI into `webServer.env` without
 * depending on whether globalSetup or webServer starts first.
 */
import { rm } from 'fs/promises'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MONGO_PORT, MONGO_DB, BACKUPS_STORAGE_ROOT } from './constants'
import { seedDatabase } from './seed'

// Stashed on globalThis so global-teardown can stop the same instance.
declare global {
    // eslint-disable-next-line no-var
    var __ASOT_MONGO__: MongoMemoryServer | undefined
}

export default async function globalSetup(): Promise<void> {
    // Fresh, empty storage scratch dir — in case a previous interrupted run
    // left a stale restic repo behind.
    await rm(BACKUPS_STORAGE_ROOT, { recursive: true, force: true }).catch(() => {})

    const mongo = await MongoMemoryServer.create({
        instance: { port: MONGO_PORT, dbName: MONGO_DB },
    })
    globalThis.__ASOT_MONGO__ = mongo

    await seedDatabase()

    // eslint-disable-next-line no-console
    console.log(`[e2e] in-memory mongod ready on ${mongo.getUri()} (db: ${MONGO_DB})`)
}
