import { join } from 'path'
import { copyFile, mkdir, writeFile } from 'fs/promises'
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { getRenderFingerprint, renderBox, renderUniform } from './client'
import { buildUniformData, buildBoxData, computeUniformHash } from './data-mapper'

const MILPACS_DIR = join(process.cwd(), '..', '..', 'storage', 'milpacs')

/**
 * Generate MilPac uniform + medal box images for a user and update the stored hash.
 * Bypasses the HTTP endpoint's auth/active-only check — caller is responsible for auth.
 *
 * The rendering itself happens in the `apps/milpac` service; this app builds the
 * payload and persists the bytes. Filenames are always derived from the user's
 * Discord ID here, never from anything the renderer or a caller supplied — see
 * apps/milpac/PLAN.md §9 finding 2, which was an arbitrary file write precisely
 * because the original built its output path from client-controlled input.
 */
export async function generateMilpacForUser(user: User): Promise<{ uniform: Buffer; medals: Buffer }> {
    const orbatEntry  = await getOrbatEntryByUserId(user.id)
    const uniformData = buildUniformData(user, orbatEntry)
    const boxData     = buildBoxData(user)
    const hash        = computeUniformHash(uniformData, boxData, await getRenderFingerprint())

    const [uniformPng, boxPng] = await Promise.all([
        renderUniform(uniformData),
        renderBox(boxData),
    ])

    await mkdir(MILPACS_DIR, { recursive: true })
    await Promise.all([
        writeFile(join(MILPACS_DIR, `${user.id}.png`), uniformPng),
        writeFile(join(MILPACS_DIR, `${user.id}-medals.png`), boxPng),
    ])

    await Db.users.updateOne(
        { _id: user._id },
        { $set: { 'milpac.uniformHash': hash } }
    )

    // Returned as well as persisted, so a caller that wants to hand the bytes
    // straight back (the bot's /milpac commands) does not have to read the file
    // it just watched being written.
    return { uniform: uniformPng, medals: boxPng }
}

/**
 * Copy the live MilPac PNGs to immutable discharge archive files.
 * Returns the relative paths stored on the snapshot record.
 * Failures are swallowed — a missing image does not block the discharge.
 */
export async function archiveMilpacImages(userId: string): Promise<{ uniformPath: string; medalPath: string }> {
    const srcUniform = join(MILPACS_DIR, `${userId}.png`)
    const srcMedals  = join(MILPACS_DIR, `${userId}-medals.png`)
    const dstUniform = join(MILPACS_DIR, `${userId}-discharge.png`)
    const dstMedals  = join(MILPACS_DIR, `${userId}-discharge-medals.png`)

    try { await copyFile(srcUniform, dstUniform) } catch { /* image may not exist yet */ }
    try { await copyFile(srcMedals,  dstMedals)  } catch { /* image may not exist yet */ }

    return {
        uniformPath: `milpacs/${userId}-discharge.png`,
        medalPath:   `milpacs/${userId}-discharge-medals.png`,
    }
}
