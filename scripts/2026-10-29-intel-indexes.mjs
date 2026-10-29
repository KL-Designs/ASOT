#!/usr/bin/env node
// One-off migration: the indexes the Intelligence Report (rows 331, 332) and
// Enemy Doctrine (rows 334, 335) rely on. Every collection is new and empty,
// so there is nothing to backfill.
//
// The unique `{ entryId, userId }` on intel_votes is what enforces one vote
// per member; the vote route upserts against it. The other two are for the
// report's reads, which filter by campaign and mission sequence.
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
    { collection: 'intel_votes',    keys: { entryId: 1, userId: 1 },                name: 'entryId_userId_unique', unique: true },
    { collection: 'intel_entries',  keys: { campaignId: 1, sourceSequence: 1 },     name: 'campaignId_sourceSequence' },
    { collection: 'intel_entries',  keys: { operationId: 1, submittedById: 1 },     name: 'operationId_submittedById' },
    { collection: 'intel_comments', keys: { entryId: 1, createdAt: 1 },             name: 'entryId_createdAt' },
    // One row per published version; `publish` numbers them from the doctrine's counter.
    { collection: 'doctrine_versions', keys: { doctrineId: 1, version: 1 },         name: 'doctrineId_version_unique', unique: true },
    { collection: 'doctrines',      keys: { level: 1, operationId: 1 },             name: 'level_operationId' },
    { collection: 'doctrines',      keys: { level: 1, campaignId: 1, parentId: 1 }, name: 'level_campaignId_parentId' },
]

const client = new MongoClient(MONGO_URI)

try {
    await client.connect()
    const db = client.db(MONGO_DB)

    for (const { collection, keys, name, unique } of INDEXES) {
        if (!APPLY) {
            console.log(`[dry-run] would create ${unique ? 'unique ' : ''}index ${name} on ${collection}`, keys)
            continue
        }
        await db.collection(collection).createIndex(keys, { unique: !!unique, name })
        console.log(`created ${unique ? 'unique ' : ''}index ${name} on ${collection}`)
    }

    if (!APPLY) console.log('\nDry run. Re-run with --apply to create them.')
} finally {
    await client.close()
}
