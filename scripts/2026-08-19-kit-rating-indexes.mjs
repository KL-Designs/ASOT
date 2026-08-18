#!/usr/bin/env node
// One-off migration: create the unique indexes the kit rating and copy-count
// collections rely on. Both are new and empty, so there is nothing to backfill
// — `ratingAvg`, `ratingCount`, `copyCount` and `tags` are all optional and
// read as 0/0/0/[] when absent.
//
// The uniqueness is not decoration: `{ loadoutId, userId }` is what enforces
// one rating per member, and `{ loadoutId, actorId }` is what makes a copy
// count distinct actors rather than clicks. Both routes upsert against them.
//
// Dry-run by default. Pass --apply to write changes.

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

const INDEXES = [
    { collection: 'loadout_ratings', keys: { loadoutId: 1, userId: 1 },  name: 'loadoutId_userId_unique' },
    { collection: 'loadout_copies',  keys: { loadoutId: 1, actorId: 1 }, name: 'loadoutId_actorId_unique' },
]

const client = new MongoClient(MONGO_URI)

try {
    await client.connect()
    const db = client.db(MONGO_DB)

    for (const { collection, keys, name } of INDEXES) {
        if (!APPLY) {
            console.log(`[dry-run] would create unique index ${name} on ${collection}`, keys)
            continue
        }
        await db.collection(collection).createIndex(keys, { unique: true, name })
        console.log(`created unique index ${name} on ${collection}`)
    }

    if (!APPLY) console.log('\nDry run. Re-run with --apply to create them.')
} finally {
    await client.close()
}
