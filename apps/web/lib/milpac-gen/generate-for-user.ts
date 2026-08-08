import { join } from 'path'
import { copyFile } from 'fs/promises'
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { generateUniform } from './uniform'
import { generateBox } from './box'
import { buildUniformData, buildBoxData, computeUniformHash } from './data-mapper'

/**
 * Generate MilPac uniform + medal box images for a user and update the stored hash.
 * Bypasses the HTTP endpoint's auth/active-only check — caller is responsible for auth.
 */
export async function generateMilpacForUser(user: User): Promise<void> {
    const orbatEntry  = await getOrbatEntryByUserId(user.id)
    const uniformData = buildUniformData(user, orbatEntry)
    const boxData     = buildBoxData(user)
    const hash        = computeUniformHash(uniformData, boxData)

    await Promise.all([generateUniform(uniformData), generateBox(boxData)])

    await Db.users.updateOne(
        { _id: user._id },
        { $set: { 'milpac.uniformHash': hash } }
    )
}

/**
 * Copy the live MilPac PNGs to immutable discharge archive files.
 * Returns the relative paths stored on the snapshot record.
 * Failures are swallowed — a missing image does not block the discharge.
 */
export async function archiveMilpacImages(userId: string): Promise<{ uniformPath: string; medalPath: string }> {
    const milpacsDir = join(process.cwd(), '..', '..', 'storage', 'milpacs')
    const srcUniform = join(milpacsDir, `${userId}.png`)
    const srcMedals  = join(milpacsDir, `${userId}-medals.png`)
    const dstUniform = join(milpacsDir, `${userId}-discharge.png`)
    const dstMedals  = join(milpacsDir, `${userId}-discharge-medals.png`)

    try { await copyFile(srcUniform, dstUniform) } catch { /* image may not exist yet */ }
    try { await copyFile(srcMedals,  dstMedals)  } catch { /* image may not exist yet */ }

    return {
        uniformPath: `milpacs/${userId}-discharge.png`,
        medalPath:   `milpacs/${userId}-discharge-medals.png`,
    }
}
