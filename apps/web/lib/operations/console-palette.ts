import { hexToHsl, hslToHex, readableOn } from '@/lib/colour'

export interface ConsolePalette {
    glass: string
    glass2: string
    glass3: string
    glassOn: string
    phos: string
    phos2: string
    ink: string
    ink2: string
    ink3: string
    alarm: string
}

/**
 * The whole console, built from one hue.
 *
 * This is a monochrome screen and the operation's colour is the phosphor, so
 * there is nothing here that is not derived from it — the cast in the glass,
 * the hairlines, the body copy, the signal. What separates them is saturation
 * and brightness, never hue, which is how a real single-phosphor tube works
 * and the only way to hand a page over to an arbitrary colour without it
 * turning into a clash.
 *
 * Nothing is used raw. Each step is a *proposal* — a chosen saturation and
 * lightness — passed through `readableOn` against the ground it will sit on,
 * which returns it untouched if it already clears and lifts it if it does not.
 * So the ramp keeps its intended shape for a well-behaved colour and degrades
 * to "legible" rather than to "wrong" for a badly-behaved one.
 *
 * Each call passes its own `minSaturation`, which matters: the default would
 * drag a deliberately desaturated ink up to 0.45 the moment it needed lifting,
 * and the inks are desaturated on purpose — they have to stay clear of the
 * signal, which is the same hue.
 */
export function consolePalette(themeColor: string): ConsolePalette {
    const raw = themeColor || '#db001d'
    const { h, s: rawSat } = hexToHsl(raw)
    /* A near-grey theme colour would give a near-grey screen, which is not a
       monochrome console, it is a broken one. Floored, never cut. */
    const sat = Math.max(rawSat, 0.55)
    /* The glass carries the hue too. A neutral black behind a coloured tube
       looks like a coloured tube sitting on a page — the one thing this theme
       cannot look like — but it has to stay near-black, so the saturation is
       capped rather than shared. */
    const cast = Math.min(sat, 0.55)

    const glass = hslToHex({ h, s: cast, l: 0.028 })

    return {
        glass,
        glass2: hslToHex({ h, s: cast, l: 0.045 }),
        glass3: hslToHex({ h, s: cast, l: 0.012 }),
        /* What sits on a filled block of tube colour. The signal below clears
           7:1 against near-black, so near-black on it is the same guarantee
           read the other way round. */
        glassOn: hslToHex({ h, s: Math.min(sat, 0.6), l: 0.05 }),

        /* Two brightnesses of tube. The upper one is also the signal: on a
           monochrome screen "brighter" and "means something" are the same
           statement. */
        phos: readableOn(hslToHex({ h, s: sat, l: 0.64 }), glass, 7, sat),
        phos2: readableOn(hslToHex({ h, s: sat * 0.85, l: 0.47 }), glass, 4.5, sat * 0.85),

        /* Text. Low saturation so it reads as light *from* this screen rather
           than as neutral grey laid over it, while staying clear of the signal
           it shares a hue with. */
        ink: readableOn(hslToHex({ h, s: 0.30, l: 0.93 }), glass, 12, 0.30),
        ink2: readableOn(hslToHex({ h, s: 0.20, l: 0.72 }), glass, 7, 0.20),
        ink3: readableOn(hslToHex({ h, s: 0.16, l: 0.55 }), glass, 4.5, 0.16),

        alarm: alarmFor(h, glass),
    }
}

/**
 * The one lamp that is not the tube.
 *
 * Red, unless the tube is already red — at which point a red alarm stops being
 * a different thing and becomes a slightly different shade of the same thing.
 * Within 45° of red it takes the operation's complement instead, which is the
 * furthest any hue can get from the screen it has to stand out against.
 *
 * 45° rather than something tighter because the collision is not a knife edge:
 * an orange screen at 15° makes a red alarm nearly invisible long before the
 * two hues are actually equal.
 */
function alarmFor(hue: number, glass: string): string {
    const fromRed = Math.min(hue, 360 - hue)
    const h = fromRed < 45 ? (hue + 180) % 360 : 0
    return readableOn(hslToHex({ h, s: 0.85, l: 0.66 }), glass, 4.5, 0.85)
}
