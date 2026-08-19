/* ============================================================================
   HZN-MED — the monitor's voice.

   Everything is synthesised: a handful of oscillators and one noise buffer, so
   there are no audio files to ship and nothing to load before the first beep.

   Two rules the rest of the menu depends on:

   · The context is created lazily, inside a user gesture. Browsers will not
     start audio any other way, and one built at import time arrives suspended
     and silent with no obvious reason why.
   · Nothing here throws. A blocked or unsupported AudioContext leaves a
     monitor that simply makes no noise, which is a great deal better than a
     medical menu that will not open.
   ========================================================================== */

export type Alarm = 'none' | 'urgent' | 'flatline'

export class Monitor {
    private ctx: AudioContext | null = null
    private master: GainNode | null = null
    private noise: AudioBuffer | null = null

    /** The continuous alarm, if one is sounding. */
    private alarm: Alarm = 'none'
    private alarmTimer: ReturnType<typeof setInterval> | null = null
    private alarmNodes: { osc: OscillatorNode, gain: GainNode } | null = null
    /** The analysis tone, held so aborting the action can cut it short. */
    private analyseOsc: OscillatorNode | null = null

    private muted = false

    /* ---------- lifecycle ------------------------------------------------- */

    /** Safe to call as often as you like; only the first call does anything. */
    private wake(): AudioContext | null {
        if (this.ctx) {
            // Tab switches and autoplay policy both leave it suspended.
            if (this.ctx.state === 'suspended') void this.ctx.resume()
            return this.ctx
        }
        try {
            const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
            if (!Ctor) return null
            const ctx = new Ctor()
            const master = ctx.createGain()
            master.gain.value = this.muted ? 0 : 0.9
            master.connect(ctx.destination)

            // One second of white noise, reused for the defibrillator's thump.
            const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
            const data = buf.getChannelData(0)
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

            this.ctx = ctx
            this.master = master
            this.noise = buf
            return ctx
        } catch {
            return null
        }
    }

    /** Call from a click handler once, so the first beep is not swallowed. */
    unlock() { this.wake() }

    setMuted(muted: boolean) {
        this.muted = muted
        if (this.master && this.ctx) {
            this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02)
        }
    }

    close() {
        this.setAlarm('none')
        this.stopAnalyse()
        try { void this.ctx?.close() } catch { /* already gone */ }
        this.ctx = null
        this.master = null
    }

    /* ---------- one-shots ------------------------------------------------- */

    private blip(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine') {
        const ctx = this.ctx!, master = this.master!
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, at)
        // Ramped rather than switched: a square-edged envelope clicks.
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(gain, at + 0.006)
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        osc.connect(g); g.connect(master)
        osc.start(at); osc.stop(at + dur + 0.02)
    }

    /**
     * One QRS.
     *
     * Pitch falls with saturation, the way a real monitor's does — it is the
     * one parameter you are meant to hear without looking at the screen.
     */
    beat(spo2: number) {
        const ctx = this.wake()
        if (!ctx || this.muted) return
        const clamped = Math.max(60, Math.min(100, spo2))
        const freq = 420 + (clamped - 60) * 13   // 60% → 420Hz, 100% → 940Hz
        this.blip(freq, ctx.currentTime, 0.075, 0.09)
    }

    /**
     * The machine thinking.
     *
     * One oscillator pulsed on a schedule rather than a timer firing blips,
     * so aborting the analysis can stop it — a tone that outlives the action
     * that started it is worse than no tone at all.
     */
    analysing(seconds: number) {
        const ctx = this.wake()
        if (!ctx || this.muted) return
        this.stopAnalyse()
        const t = ctx.currentTime
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(660, t)
        g.gain.setValueAtTime(0.0001, t)
        for (let i = 0; i * 0.42 < seconds; i++) {
            const at = t + i * 0.42
            g.gain.setValueAtTime(0.0001, at)
            g.gain.linearRampToValueAtTime(0.032, at + 0.02)
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2)
        }
        osc.connect(g); g.connect(this.master!)
        osc.start(t); osc.stop(t + seconds + 0.1)
        this.analyseOsc = osc
    }

    stopAnalyse() {
        if (!this.analyseOsc) return
        try { this.analyseOsc.stop() } catch { /* already stopped */ }
        this.analyseOsc = null
    }

    /** What the analysis found. The two answers should not sound alike. */
    verdict(shockable: boolean) {
        const ctx = this.wake()
        if (!ctx || this.muted) return
        this.stopAnalyse()
        const t = ctx.currentTime
        if (shockable) {
            // Rising and insistent — the machine telling you to stand clear.
            for (const [i, f] of [880, 1046, 1318].entries()) this.blip(f, t + i * 0.16, 0.16, 0.075, 'square')
            return
        }
        // Two notes down, and done. Nothing here for this box.
        this.blip(587, t, 0.22, 0.055, 'triangle')
        this.blip(440, t + 0.24, 0.36, 0.055, 'triangle')
    }

    /** The defibrillator winding up. Returns when it is charged. */
    charge(seconds: number) {
        const ctx = this.wake()
        if (!ctx || this.muted) return
        const t = ctx.currentTime
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(180, t)
        osc.frequency.exponentialRampToValueAtTime(1500, t + seconds)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.05, t + seconds * 0.7)
        g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.08)
        osc.connect(g); g.connect(this.master!)
        osc.start(t); osc.stop(t + seconds + 0.1)

        // The charged tone, held until the shock lands.
        this.blip(1760, t + seconds, 0.35, 0.06, 'triangle')
    }

    /** The discharge itself — a crack over a low thump. */
    shock() {
        const ctx = this.wake()
        if (!ctx || this.muted || !this.noise) return
        const t = ctx.currentTime

        const src = ctx.createBufferSource()
        src.buffer = this.noise
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 900
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.4, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
        src.connect(filter); filter.connect(g); g.connect(this.master!)
        src.start(t); src.stop(t + 0.2)

        const thump = ctx.createOscillator()
        const tg = ctx.createGain()
        thump.type = 'sine'
        thump.frequency.setValueAtTime(140, t)
        thump.frequency.exponentialRampToValueAtTime(45, t + 0.25)
        tg.gain.setValueAtTime(0.35, t)
        tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
        thump.connect(tg); tg.connect(this.master!)
        thump.start(t); thump.stop(t + 0.32)
    }

    /* ---------- continuous alarms ----------------------------------------- */

    setAlarm(next: Alarm) {
        if (next === this.alarm) return
        this.alarm = next

        if (this.alarmTimer) { clearInterval(this.alarmTimer); this.alarmTimer = null }
        if (this.alarmNodes) {
            try { this.alarmNodes.osc.stop() } catch { /* already stopped */ }
            this.alarmNodes = null
        }
        if (next === 'none') return

        const ctx = this.wake()
        if (!ctx) return

        if (next === 'flatline') {
            // Asystole: the unbroken tone everybody in the room recognises.
            const osc = ctx.createOscillator()
            const g = ctx.createGain()
            osc.type = 'sine'
            osc.frequency.value = 990
            g.gain.value = 0.055
            osc.connect(g); g.connect(this.master!)
            osc.start()
            this.alarmNodes = { osc, gain: g }
            return
        }

        // Urgent: the three-pulse pattern a monitor uses for a red alarm,
        // repeating until somebody does something about it.
        const burst = () => {
            const ctx2 = this.ctx
            if (!ctx2 || this.muted) return
            const t = ctx2.currentTime
            for (let i = 0; i < 3; i++) this.blip(i === 2 ? 1046 : 880, t + i * 0.14, 0.1, 0.07, 'square')
        }
        burst()
        this.alarmTimer = setInterval(burst, 1600)
    }
}
