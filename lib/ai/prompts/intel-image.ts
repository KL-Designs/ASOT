/**
 * Constructs prompts for the Intel Image Creator.
 *
 * Rules enforced here:
 * - Character identity/equipment is always preserved unless explicitly changed
 * - Camera style is conveyed through framing/perspective/rendering only — never as text in the image
 * - No HUD text, timestamps, recording indicators, or overlay graphics in the AI output
 *   (a transparent PNG overlay is composited server-side after generation)
 * - Thermal/NV rendering is requested from the model (genuine sensor look, not a CSS filter)
 */

export interface IntelImagePromptOptions {
    cameraStyle: AiCameraStyle
    sceneDescription: string
    pose: AiPoseOption
    poseDescription?: string
    framingDistance?: AiFramingDistance
    environment?: string
    timeOfDay?: string
    weather?: string
    mood?: string
    extraInstructions?: string
    hasSourceImage: boolean
    equipmentLock: boolean
    structureLock: boolean
}

const FRAMING_INSTRUCTIONS: Record<AiFramingDistance, string> = {
    close:       `Tight framing — the primary subject fills most of the frame. Close to medium-close shooting distance.`,
    medium:      `Medium framing — the primary subject occupies roughly half the frame with clear environment context visible around them.`,
    wide:        `Wide framing — the primary subject is clearly visible but relatively small, with the surrounding environment dominating the composition.`,
    establishing:`Establishing shot — very wide framing. The primary subject is a recognisable figure within a full scene. Terrain, structures, and context fill most of the frame.`,
}

const CAMERA_STYLE_INSTRUCTIONS: Record<AiCameraStyle, string> = {
    dslr: `Eye-level documentary DSLR photograph, 50–85mm lens character, realistic depth of field, crisp focal subject, softer background, balanced exposure and restrained cinematic contrast. No HUD text.`,

    helmet_cam: `First-person helmet-mounted perspective, slight wide-angle distortion, practical field framing, realistic movement and mild edge softness. No HUD text.`,

    bodycam: `Chest-height body-worn camera perspective, mildly wide lens, imperfect documentary framing, realistic motion and exposure. No UI text.`,

    drone_uav: `Elevated UAV perspective at greater distance, clearly looking down. Remove tent or overhead obstruction. Place subject in an open area. Retain the same principal subject and group relationship. No HUD text.`,

    cctv: `Fixed security-camera view from a high corner or distant mounted camera, broad field of view, compressed detail and neutral surveillance framing. No timestamps or UI.`,

    long_range: `Long-range reconnaissance photography through a telephoto optic, distant compressed perspective, subtle atmospheric haze and credible surveillance distance. No reticle graphics.`,

    satellite_isr: `Near-vertical high-altitude ISR perspective. Subjects smaller but interpretable, prioritising terrain and spatial relationships. No grids, labels or telemetry.`,

    thermal: `Monochrome thermal/infrared rendition using white-hot polarity, credible heat signatures on exposed skin and warm equipment, cooler surroundings and readable silhouettes. No HUD.`,

    night_vision: `Realistic low-light night-vision rendition with monochrome green luminance, sensor grain, controlled bloom and readable silhouettes. No HUD text.`,
}

const POSE_INSTRUCTIONS: Record<Exclude<AiPoseOption, 'custom'>, string> = {
    keep: `Preserve the subject's pose exactly as shown in the source image. Do not change their stance, arm position, weapon grip, or body orientation.`,
    ai:   `Select a natural, contextually appropriate pose for the described scene. The pose should look realistic and purposeful for the environment and activity.`,
}

export function buildIntelImagePrompt(opts: IntelImagePromptOptions): string {
    const lines: string[] = []

    // ── PREAMBLE: locks must be declared FIRST so the model reads them before ───
    // any scene context that could prime unwanted associations.
    const anyLock = opts.hasSourceImage && (opts.equipmentLock || opts.structureLock)

    if (anyLock) {
        const lockTypes: string[] = []
        if (opts.equipmentLock) lockTypes.push('people, vehicles, aircraft, and all carried/worn items')
        if (opts.structureLock) lockTypes.push('buildings, structures, terrain, and environmental layout')

        lines.push(`TASK: You are rendering a photorealistic version of the scene shown in the source image.`)
        lines.push(`The source image defines what exists in this scene. The following elements are LOCKED and must be reproduced faithfully:`)
        lines.push(`${lockTypes.map(t => `- ${t}`).join('\n')}`)
        lines.push(`THE SCENE DESCRIPTION BELOW DEFINES ATMOSPHERE, LIGHTING, AND CAMERA ONLY — it does not add, remove, or change any locked element.`)
        lines.push(``)
    }

    if (opts.hasSourceImage && opts.equipmentLock) {
        lines.push(`PEOPLE / VEHICLES / EQUIPMENT — ABSOLUTE LOCK:`)
        lines.push(`Every person, vehicle, and aircraft visible in the source image must appear in the output with IDENTICAL appearance.`)
        lines.push(`- Each person's face, skin tone, hair, and facial features: copy exactly`)
        lines.push(`- Each person's clothing, uniform, colour, cut, insignia, and rank markings: copy exactly`)
        lines.push(`- Each person's equipment load-out: if they carry or wear something, keep it exactly; if they do not have something, do NOT add it`)
        lines.push(`- Vehicles and aircraft: reproduce make, model, colour, markings, and condition exactly`)
        lines.push(`- A person with no weapons has NO weapons regardless of how tactical the scene is`)
        lines.push(`- A person in a dress uniform stays in a dress uniform regardless of the environment`)
        lines.push(`- Do NOT add, remove, or substitute any person, vehicle, aircraft, weapon, or piece of equipment`)
        lines.push(``)
    }

    if (opts.hasSourceImage && opts.structureLock) {
        lines.push(`STRUCTURES / TERRAIN — ABSOLUTE LOCK:`)
        lines.push(`All buildings, fortifications, infrastructure, and terrain features visible in the source image must be reproduced with the same layout, relative positions, scale, and proportions.`)
        lines.push(`- Building footprints, heights, massing, and general form: preserve exactly`)
        lines.push(`- Door and window positions, sizes, and appearance: preserve exactly`)
        lines.push(`- Walls, fencing, perimeter features, and barriers: preserve exactly`)
        lines.push(`- Roads, paths, open areas, and their relative positions: preserve exactly`)
        lines.push(`- Terrain contours, elevated features, and natural landmarks: preserve exactly`)
        lines.push(`- You MAY add contextually appropriate ambient activity (people moving, parked vehicles) only where the source image shows open/empty space that would realistically contain such activity`)
        lines.push(`- Do NOT relocate, resize, add, or remove any building, structure, or significant terrain feature`)
        lines.push(``)
    }

    lines.push(`Generate a photorealistic intelligence/surveillance image for a military tactical simulation briefing.`)
    lines.push(``)

    // Character identity preservation
    if (opts.hasSourceImage) {
        lines.push(`CHARACTER IDENTITY — MANDATORY:`)
        lines.push(`- Face, facial structure, skin tone, hair colour, and hair style: copy exactly from source`)
        lines.push(`- All headgear, eyewear, and face-level accessories: copy exactly`)
        lines.push(`- Complete uniform including colour, pattern, cut, buttons, insignia, patches, rank: copy exactly`)
        if (opts.equipmentLock) {
            lines.push(`- Equipment: copy exactly what is visible — nothing added, nothing removed, nothing substituted`)
        } else {
            lines.push(`- Equipment: preserve unless explicitly changed in the scene description or extra instructions`)
        }
        lines.push(``)
    }

    // Pose
    lines.push(`POSE:`)
    if (opts.pose === 'custom' && opts.poseDescription) {
        lines.push(`- ${opts.poseDescription}`)
    } else {
        lines.push(`- ${POSE_INSTRUCTIONS[opts.pose as Exclude<AiPoseOption, 'custom'>]}`)
    }
    lines.push(``)

    // Scene — label clarifies scope when locks are active
    if (anyLock) {
        lines.push(`ATMOSPHERE / LIGHTING / CAMERA CONTEXT (does NOT override any locked element):`)
    } else {
        lines.push(`SCENE:`)
    }
    lines.push(`- Description: ${opts.sceneDescription}`)
    if (opts.environment)        lines.push(`- Environment: ${opts.environment}`)
    if (opts.timeOfDay)          lines.push(`- Time of day: ${opts.timeOfDay}`)
    if (opts.weather)            lines.push(`- Weather: ${opts.weather}`)
    if (opts.mood)               lines.push(`- Atmosphere / mood: ${opts.mood}`)
    if (opts.extraInstructions)  lines.push(`- Additional: ${opts.extraInstructions}`)
    lines.push(``)

    // Camera style + framing
    lines.push(`CAMERA / SENSOR TYPE:`)
    lines.push(`- ${CAMERA_STYLE_INSTRUCTIONS[opts.cameraStyle]}`)
    if (opts.framingDistance) {
        lines.push(`- FRAMING: ${FRAMING_INSTRUCTIONS[opts.framingDistance]}`)
    }
    lines.push(``)

    // Hard rules
    lines.push(`CRITICAL RULES:`)
    lines.push(`- The image must look like a genuine real-world photograph or sensor capture — not a video game or digital art`)
    lines.push(`- Do NOT change ethnicity, skin colour, or facial structure`)
    lines.push(`- Do NOT merge people, duplicate limbs, alter hand count or distort faces`)
    lines.push(`- Do NOT display any camera model names, brand names, sensor type labels, or camera-style titles as visible text`)
    lines.push(`- Do NOT add HUD text, timestamps, recording indicators, battery icons, GPS coordinates, altitude readouts, crosshairs, reticles, or any overlay graphics — a transparent overlay will be composited separately`)
    lines.push(`- Do NOT add watermarks or logos`)

    if (opts.equipmentLock && opts.hasSourceImage) {
        lines.push(`- EQUIPMENT / PEOPLE / VEHICLES — FINAL REMINDER: Every person, vehicle, and aircraft from the source image appears in this output UNCHANGED. No item added, removed, or substituted. The nature of the scene does NOT grant permission to alter any person's appearance, clothing, or equipment.`)
    } else if (opts.equipmentLock && !opts.hasSourceImage) {
        lines.push(`- EQUIPMENT LOCK — ACTIVE: Do NOT add weapons, chest rigs, plate carriers, pouches, backpacks, helmets, face masks, goggles, gloves, radios, or any tactical accessory unless explicitly named in the scene description. Atmosphere and mood are NOT permission to add gear.`)
    } else {
        lines.push(`- Equipment and clothing may be adapted to fit the scene when not explicitly locked.`)
    }

    if (opts.structureLock && opts.hasSourceImage) {
        lines.push(`- STRUCTURES / TERRAIN — FINAL REMINDER: The layout, scale, and position of all buildings, structures, and terrain features from the source image must remain exactly as shown. Do not relocate, resize, demolish, or add any structure.`)
    }

    return lines.join('\n')
}

export function getCameraStyleLabel(style: AiCameraStyle): string {
    const labels: Record<AiCameraStyle, string> = {
        dslr:          'DSLR',
        helmet_cam:    'Helmet Camera',
        bodycam:       'Bodycam',
        drone_uav:     'Drone / UAV',
        cctv:          'CCTV',
        long_range:    'Long-Range / Telephoto',
        satellite_isr: 'Satellite / ISR',
        thermal:       'Thermal',
        night_vision:  'Night Vision',
    }
    return labels[style]
}

export const ALL_CAMERA_STYLES: AiCameraStyle[] = [
    'dslr', 'helmet_cam', 'bodycam', 'drone_uav', 'cctv',
    'long_range', 'satellite_isr', 'thermal', 'night_vision',
]

export function getSizeForAspectRatio(
    aspectRatio: 'portrait' | 'landscape' | 'square'
): '1024x1024' | '1024x1536' | '1536x1024' {
    if (aspectRatio === 'portrait')  return '1024x1536'
    if (aspectRatio === 'landscape') return '1536x1024'
    return '1024x1024'
}
