// One-off setup: downloads the restic binary for the current OS/arch into
// apps/web/bin/, if it isn't already there. Safe to re-run — no-ops if the
// binary already exists. Mirrors the zero-manual-steps precedent sharp's own
// postinstall already sets in this repo (see apps/web/package.json).
//
// Only needed for native/Windows-style dev — the Docker image installs
// restic via `apk add restic` instead (see apps/web/Dockerfile).
//
// Usage: node scripts/ensure-restic.mjs

import { existsSync, mkdirSync, createWriteStream, createReadStream, chmodSync, readdirSync, rmSync, renameSync } from 'fs'
import { join, resolve } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const BIN_DIR = resolve('apps/web/bin')
const BINARY_NAME = process.platform === 'win32' ? 'restic.exe' : 'restic'
const BINARY_PATH = join(BIN_DIR, BINARY_NAME)

async function main() {
    if (existsSync(BINARY_PATH)) {
        console.log(`[restic] Already present at ${BINARY_PATH} — nothing to do.`)
        return
    }

    console.log('[restic] Looking up latest release…')
    const releaseRes = await fetch('https://api.github.com/repos/restic/restic/releases/latest')
    if (!releaseRes.ok) throw new Error(`GitHub API request failed: ${releaseRes.status}`)
    const release = await releaseRes.json()

    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const ext = platform === 'windows' ? 'zip' : 'bz2'

    const asset = release.assets.find(a => a.name.includes(`_${platform}_${arch}.${ext}`))
    if (!asset) throw new Error(`No restic release asset found for ${platform}_${arch} (looked in ${release.tag_name})`)

    console.log(`[restic] Downloading ${asset.name}…`)
    mkdirSync(BIN_DIR, { recursive: true })
    const downloadRes = await fetch(asset.browser_download_url)
    if (!downloadRes.ok || !downloadRes.body) throw new Error(`Download failed: ${downloadRes.status}`)

    if (platform === 'windows') {
        const tmpZip = join(BIN_DIR, 'restic-download.zip')
        await pipeline(Readable.fromWeb(downloadRes.body), createWriteStream(tmpZip))
        // Expand-Archive is built into every supported Windows version — avoids
        // needing a zip-extraction npm dependency just for this one-off script.
        await execFileAsync('powershell.exe', [
            '-NoProfile', '-Command',
            `Expand-Archive -Path "${tmpZip}" -DestinationPath "${BIN_DIR}" -Force`,
        ])
        rmSync(tmpZip, { force: true })
        const extracted = readdirSync(BIN_DIR).find(f => /^restic.*\.exe$/i.test(f) && f !== BINARY_NAME)
        if (!extracted) throw new Error('Expand-Archive did not produce a restic .exe')
        renameSync(join(BIN_DIR, extracted), BINARY_PATH)
    } else {
        const tmpBz2 = join(BIN_DIR, 'restic-download.bz2')
        await pipeline(Readable.fromWeb(downloadRes.body), createWriteStream(tmpBz2))
        await execFileAsync('bunzip2', ['-f', tmpBz2])
        renameSync(tmpBz2.replace(/\.bz2$/, ''), BINARY_PATH)
        chmodSync(BINARY_PATH, 0o755)
    }

    console.log(`[restic] Installed to ${BINARY_PATH}`)
}

main().catch(err => { console.error('[restic] Setup failed:', err.message); process.exit(1) })
