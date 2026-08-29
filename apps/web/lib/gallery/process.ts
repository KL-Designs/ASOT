import sharp from 'sharp'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { statSync } from 'fs'

import { MAX_VIDEO_SECONDS } from './limits'

const run = promisify(execFile)

/**
 * Turning what a member uploaded into what the gallery serves.
 *
 * Stills go through sharp with a 4K ceiling. Note that the gallery is an
 * explicit exemption from `lib/uploads/image.ts` — see GALLERY_IS_EXEMPT in
 * image-limits.ts, whose reasoning is that this is "the one place whose entire
 * purpose is the picture itself". A 4K ceiling honours that: nothing anybody
 * can display is lost, while a 15MB phone photo comes down to about 2MB.
 *
 * Video goes through ffmpeg, which is in the image (see the dockerfile). It is
 * probed first, so a clip over the length limit is refused before a single
 * frame is encoded — a five-minute 1080p transcode is one to three minutes of
 * CPU and there is no point spending it on something that will be rejected.
 */

/** Deliberately below 4K on the long edge in both directions rather than a
 *  fixed landscape box: a portrait screenshot should not be upscaled. */
const STILL_BOX = { width: 3840, height: 2160 }
const STILL_QUALITY = 82

export type ProcessedStill = { ext: string, width: number, height: number, bytes: number }
export type ProcessedVideo = { ext: 'mp4', width: number, height: number, durationSec: number, bytes: number }

export async function probeVideo(file: string): Promise<{ durationSec: number, width: number, height: number } | null> {
    try {
        const { stdout } = await run('ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height:format=duration',
            '-of', 'json',
            file,
        ], { maxBuffer: 1024 * 1024 })

        const parsed = JSON.parse(stdout)
        const stream = parsed.streams?.[0]
        const duration = Number(parsed.format?.duration)

        // No video stream at all: an audio file with a video extension, or a
        // container ffprobe could not make sense of. Not a video.
        if (!stream?.width || !stream?.height || !Number.isFinite(duration)) return null

        return { durationSec: duration, width: stream.width, height: stream.height }
    } catch {
        return null
    }
}

export async function processStill(staged: string, destNoExt: string): Promise<ProcessedStill> {
    const dest = `${destNoExt}.jpg`

    const info = await sharp(staged, { limitInputPixels: 300_000_000 })
        .rotate()                                  // honour EXIF orientation before resizing
        .resize({ ...STILL_BOX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: STILL_QUALITY, mozjpeg: true })
        .toFile(dest)

    return { ext: 'jpg', width: info.width, height: info.height, bytes: statSync(dest).size }
}

export async function processVideo(staged: string, destNoExt: string): Promise<ProcessedVideo> {
    const probe = await probeVideo(staged)
    if (!probe) throw new Error('That file does not contain a video stream.')
    if (probe.durationSec > MAX_VIDEO_SECONDS) {
        throw new Error(`Clips must be under ${MAX_VIDEO_SECONDS / 60} minutes.`)
    }

    const dest = `${destNoExt}.mp4`

    await run('ffmpeg', [
        '-y', '-i', staged,
        '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast',
        // -2 rather than -1 on the height: H.264 requires even dimensions, and
        // an odd height is a hard encoder failure rather than a warning.
        '-vf', "scale='min(1920,iw)':-2",
        '-c:a', 'aac', '-b:a', '128k',
        // Moves the moov atom to the front. Without it the browser must
        // download the entire file before it can play a frame.
        '-movflags', '+faststart',
        dest,
    ], { maxBuffer: 10 * 1024 * 1024 })

    await run('ffmpeg', [
        '-y', '-ss', '1', '-i', dest,
        '-frames:v', '1', '-q:v', '3',
        `${destNoExt}_poster.jpg`,
    ], { maxBuffer: 10 * 1024 * 1024 })

    const out = await probeVideo(dest)

    return {
        ext: 'mp4',
        width: out?.width ?? probe.width,
        height: out?.height ?? probe.height,
        durationSec: Math.round(probe.durationSec),
        bytes: statSync(dest).size,
    }
}
