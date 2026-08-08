import path from 'path'
import fs from 'fs/promises'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const OVERLAYS_DIR = path.join(process.cwd(), 'public', 'overlays')

const OVERLAY_FILES: Record<AiCameraStyle, string> = {
    dslr:          '01_dslr_overlay.png',
    helmet_cam:    '02_helmet_cam_overlay.png',
    bodycam:       '03_bodycam_overlay.png',
    drone_uav:     '04_drone_uav_overlay.png',
    cctv:          '05_cctv_overlay.png',
    long_range:    '06_telephoto_recon_overlay.png',
    satellite_isr: '07_satellite_isr_overlay.png',
    thermal:       '08_thermal_overlay.png',
    night_vision:  '09_night_vision_overlay.png',
}

/**
 * Composites a camera-style PNG overlay on top of a clean AI-generated image buffer.
 * The overlay is scaled to match the base image dimensions.
 * Returns the composited image as a PNG buffer.
 *
 * Note: overlay is read via fs.readFile into a Buffer before passing to loadImage
 * to avoid Windows path issues with loadImage(string).
 */
export async function compositeOverlay(
    cleanImageBuffer: Buffer,
    cameraStyle: AiCameraStyle
): Promise<Buffer> {
    if (!cleanImageBuffer || cleanImageBuffer.length === 0) {
        throw new Error('compositeOverlay: clean image buffer is empty')
    }

    const overlayFile   = path.join(OVERLAYS_DIR, OVERLAY_FILES[cameraStyle])
    const overlayBuffer = await fs.readFile(overlayFile)

    const [base, overlay] = await Promise.all([
        loadImage(cleanImageBuffer),
        loadImage(overlayBuffer),
    ])

    const canvas = createCanvas(base.width, base.height)
    const ctx    = canvas.getContext('2d')

    ctx.drawImage(base, 0, 0)
    ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height)

    return canvas.toBuffer('image/png')
}
