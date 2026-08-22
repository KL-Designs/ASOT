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

/**
 * The kit, as noises.
 *
 * All of it is two ingredients — a filtered burst of the same noise buffer, and
 * a swept oscillator — arranged to sound like the thing. A tourniquet is a
 * ratchet: five clicks and a strap. Suturing is four tugs. Compressions are a
 * thud with no ring on it. None of it is a recording and none of it needs to
 * be; what matters is that you can tell them apart with your eyes on the
 * casualty, which is the whole point of having them.
 */
export type Sfx =
    | 'bandage' | 'tourniquet' | 'tqOff' | 'splint' | 'suture'
    | 'needle' | 'decompress' | 'fluid' | 'syringe' | 'suction'
    | 'tube' | 'seal' | 'pads' | 'cuff' | 'roll'
    | 'reboaUp' | 'reboaDown' | 'compress' | 'bag' | 'refuse'
    | 'spray' | 'chew'
    /*
       The quiet half: one beat of the work rather than the finish of it.

       Repeated for as long as the progress bar is filling, so a treatment
       sounds like it is being done instead of appearing four seconds later.
       Deliberately small — they play under everything else and the monitor has
       to stay audible over the top of them.
    */
    | 'workWrap' | 'workStitch' | 'workRatchet' | 'workPump'
    | 'workProbe' | 'workScrape' | 'workCloth'

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
    /** Anything being repeated on a timer — compressions, a bag. */
    private loops = new Map<Sfx, ReturnType<typeof setInterval>>()
    /** The treatment currently under way, if it makes a noise while it runs. */
    private workTimer: ReturnType<typeof setInterval> | null = null
    /** The oxygen, which is one continuous noise rather than a repeated one. */
    private hissNodes: { src: AudioBufferSourceNode, gain: GainNode } | null = null

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
        this.stopLoops()
        this.stopWork()
        this.setHiss(false)
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

    /**
     * The casualty bringing it up.
     *
     * Filtered noise swept downwards over a low growl. Unpleasant on purpose:
     * it is the only warning you get that the airway has just closed, and it
     * has to carry across a screen you are not looking at.
     */
    vomit() {
        const ctx = this.wake()
        if (!ctx || this.muted || !this.noise) return
        const t = ctx.currentTime

        const src = ctx.createBufferSource()
        src.buffer = this.noise
        src.playbackRate.value = 0.55
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(1400, t)
        filter.frequency.exponentialRampToValueAtTime(220, t + 0.85)
        filter.Q.value = 6
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(0.3, t + 0.07)
        g.gain.setValueAtTime(0.3, t + 0.45)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
        src.connect(filter); filter.connect(g); g.connect(this.master!)
        src.start(t); src.stop(t + 0.95)

        const growl = ctx.createOscillator()
        const gg = ctx.createGain()
        growl.type = 'sawtooth'
        growl.frequency.setValueAtTime(96, t)
        growl.frequency.exponentialRampToValueAtTime(58, t + 0.8)
        gg.gain.setValueAtTime(0.0001, t)
        gg.gain.linearRampToValueAtTime(0.08, t + 0.1)
        gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.85)
        growl.connect(gg); gg.connect(this.master!)
        growl.start(t); growl.stop(t + 0.9)
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

    /* ---------- the kit --------------------------------------------------- */

    /**
     * A filtered burst of the noise buffer.
     *
     * Nearly everything mechanical is one of these: cloth, velcro, air, a wet
     * slurp. The filter sweep is what separates them — a rip goes down, a peel
     * goes up, and air just decays where it is.
     */
    private burst(at: number, dur: number, o: {
        type?: BiquadFilterType
        f0: number
        f1?: number
        q?: number
        gain: number
        rate?: number
    }) {
        const ctx = this.ctx
        if (!ctx || !this.noise) return
        const src = ctx.createBufferSource()
        src.buffer = this.noise
        src.playbackRate.value = o.rate ?? 1
        const filt = ctx.createBiquadFilter()
        filt.type = o.type ?? 'bandpass'
        filt.frequency.setValueAtTime(o.f0, at)
        if (o.f1 !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(24, o.f1), at + dur)
        filt.Q.value = o.q ?? 1
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, at)
        g.gain.linearRampToValueAtTime(o.gain, at + Math.min(0.018, dur * 0.3))
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        src.connect(filt); filt.connect(g); g.connect(this.master!)
        src.start(at); src.stop(at + dur + 0.02)
    }

    /** A swept oscillator. Thuds, squeaks and pings. */
    private swept(at: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
        const ctx = this.ctx
        if (!ctx) return
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(f0, at)
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur)
        g.gain.setValueAtTime(0.0001, at)
        g.gain.linearRampToValueAtTime(gain, at + Math.min(0.012, dur * 0.3))
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        osc.connect(g); g.connect(this.master!)
        osc.start(at); osc.stop(at + dur + 0.02)
    }

    /** One tick of a ratchet, a spike going in, a catch closing. */
    private tick(at: number, gain = 0.16, f = 3200) {
        this.burst(at, 0.035, { f0: f, q: 1.6, gain, rate: 1.4 })
    }

    /** The sound of doing the thing. Safe to call at any time. */
    play(id: Sfx) {
        const ctx = this.wake()
        if (!ctx || this.muted) return
        const t = ctx.currentTime

        switch (id) {
            case 'bandage':
                // Velcro coming off the roll, then the wrap going round.
                this.burst(t, 0.24, { f0: 2600, f1: 900, q: .8, gain: .17, rate: 1.6 })
                this.burst(t + 0.22, 0.34, { type: 'lowpass', f0: 1000, f1: 380, gain: .11 })
                break

            case 'tourniquet':
                // Strap through the buckle, then the windlass.
                this.burst(t, 0.2, { f0: 1500, f1: 700, q: .7, gain: .13, rate: 1.3 })
                for (let i = 0; i < 5; i++) this.tick(t + 0.22 + i * 0.075, 0.15 + i * 0.012, 2600 + i * 260)
                this.swept(t + 0.62, 0.1, 190, 120, 0.1)
                break

            case 'tqOff':
                this.tick(t, 0.16, 2400)
                this.burst(t + 0.05, 0.3, { type: 'lowpass', f0: 1400, f1: 320, gain: .12 })
                break

            case 'splint':
                this.burst(t, 0.22, { f0: 2400, f1: 850, q: .8, gain: .15, rate: 1.5 })
                this.swept(t + 0.24, 0.14, 150, 82, 0.13)
                break

            case 'suture':
                // Four tugs of thread, and the last one pulled tight.
                for (let i = 0; i < 4; i++) {
                    this.swept(t + i * 0.15, 0.07, 1300 - i * 90, 760, 0.055, 'triangle')
                    this.burst(t + i * 0.15, 0.05, { f0: 4200, q: 2, gain: .05, rate: 1.8 })
                }
                this.swept(t + 0.62, 0.12, 620, 380, 0.06, 'triangle')
                break

            case 'needle':
                this.tick(t, 0.13, 5200)
                this.burst(t + 0.03, 0.12, { f0: 3000, f1: 1400, q: 2.4, gain: .07 })
                break

            case 'decompress':
                // The catch, and then the chest letting go.
                this.tick(t, 0.15, 4600)
                this.burst(t + 0.05, 0.75, { type: 'lowpass', f0: 2600, f1: 340, gain: .2 })
                break

            case 'fluid':
                // Spike through the port, then it running.
                this.tick(t, 0.12, 2800)
                for (let i = 0; i < 3; i++) this.swept(t + 0.12 + i * 0.13, 0.1, 300 - i * 40, 150, 0.06)
                break

            case 'syringe':
                this.tick(t, 0.1, 3600)
                this.burst(t + 0.04, 0.36, { type: 'lowpass', f0: 700, f1: 1500, q: .6, gain: .07 })
                break

            case 'suction':
                // Wet, and going somewhere. The filter wobble is what makes it
                // sound like liquid rather than air.
                this.burst(t, 0.62, { f0: 700, f1: 2100, q: 3.2, gain: .2, rate: .8 })
                this.swept(t + 0.1, 0.4, 130, 210, 0.05, 'sawtooth')
                break

            case 'tube':
                this.tick(t, 0.09, 3000)
                this.swept(t + 0.04, 0.22, 900, 1700, 0.05, 'triangle')
                break

            case 'seal':
            case 'pads':
                // Backing peeled off, then pressed down.
                this.burst(t, 0.3, { f0: 900, f1: 3000, q: 1.4, gain: .15, rate: .9 })
                this.swept(t + 0.3, 0.1, 200, 96, 0.11)
                if (id === 'pads') {
                    this.burst(t + 0.42, 0.3, { f0: 900, f1: 3000, q: 1.4, gain: .13, rate: .9 })
                    this.swept(t + 0.72, 0.1, 190, 92, 0.1)
                }
                break

            case 'cuff':
                this.burst(t, 0.26, { f0: 2500, f1: 900, q: .8, gain: .15, rate: 1.5 })
                for (let i = 0; i < 3; i++) this.swept(t + 0.3 + i * 0.16, 0.12, 260, 150, 0.07)
                break

            case 'roll':
                this.burst(t, 0.55, { type: 'lowpass', f0: 900, f1: 260, gain: .13, rate: .7 })
                break

            case 'reboaUp':
                for (let i = 0; i < 4; i++) {
                    this.burst(t + i * 0.19, 0.15, { type: 'lowpass', f0: 800 + i * 260, f1: 300, gain: .11 })
                    this.tick(t + i * 0.19 + 0.14, 0.07, 2200)
                }
                break

            case 'reboaDown':
                this.burst(t, 0.8, { type: 'lowpass', f0: 1600, f1: 220, gain: .16 })
                break

            case 'compress':
                // A thud with no ring on it. Somebody's hands, not a heart.
                this.swept(t, 0.13, 96, 44, 0.19)
                this.burst(t, 0.06, { type: 'lowpass', f0: 420, gain: .07, rate: .7 })
                break

            case 'bag':
                this.burst(t, 0.34, { type: 'lowpass', f0: 500, f1: 1500, q: .7, gain: .1, rate: .8 })
                break

            /* ---- one beat of the work ---- */

            case 'workWrap':
                this.burst(t, 0.22, { type: 'lowpass', f0: 1600, f1: 520, gain: .055, rate: 1.1 })
                break

            case 'workStitch':
                this.swept(t, 0.06, 1250, 780, 0.035, 'triangle')
                this.burst(t, 0.04, { f0: 4000, q: 2.2, gain: .03, rate: 1.8 })
                break

            case 'workRatchet':
                this.tick(t, 0.085, 2800)
                break

            case 'workPump':
                this.burst(t, 0.16, { type: 'lowpass', f0: 620, f1: 260, gain: .06 })
                break

            case 'workProbe':
                this.blip(1500, t, 0.045, 0.028, 'sine')
                break

            case 'workScrape':
                this.burst(t, 0.19, { f0: 900, f1: 2000, q: 1.8, gain: .045, rate: .9 })
                break

            case 'workCloth':
                this.burst(t, 0.28, { type: 'lowpass', f0: 700, f1: 240, gain: .05, rate: .7 })
                break

            case 'spray':
                // One short shot of it, under the tongue.
                this.burst(t, 0.13, { f0: 4200, f1: 2400, q: 1.1, gain: .16, rate: 1.7 })
                this.tick(t, 0.06, 5200)
                break

            case 'chew':
                // A tablet, being got through. Three dry crunches, no ring.
                for (let i = 0; i < 3; i++) {
                    this.burst(t + i * 0.17, 0.07, { f0: 1100 + i * 320, q: 2.4, gain: .075, rate: 1.2 })
                }
                break

            case 'refuse':
                this.blip(420, t, 0.09, 0.05, 'square')
                this.blip(300, t + 0.1, 0.14, 0.05, 'square')
                break
        }
    }

    /* ---------- things that keep happening -------------------------------- */

    /** Start repeating one, if it is not already. Idempotent on purpose. */
    loop(id: Sfx, everyMs: number) {
        if (this.loops.has(id)) return
        this.play(id)
        this.loops.set(id, setInterval(() => this.play(id), everyMs))
    }

    stopLoop(id: Sfx) {
        const t = this.loops.get(id)
        if (t) clearInterval(t)
        this.loops.delete(id)
    }

    stopLoops() {
        for (const t of this.loops.values()) clearInterval(t)
        this.loops.clear()
    }

    /**
     * The sound of a treatment being done, for as long as it takes.
     *
     * On a timer rather than scheduled into the audio clock, because it has to
     * be able to stop early: abort a dressing half-way and the swishing should
     * stop with it, not carry on into whatever you do next.
     */
    work(id: Sfx, everyMs: number, seconds: number) {
        this.stopWork()
        const ctx = this.wake()
        if (!ctx || this.muted) return
        this.play(id)
        // Half a beat short of the end, so the working sound never lands on
        // top of the noise the finished thing makes.
        const until = seconds * 1000 - everyMs * 0.6
        let elapsed = 0
        this.workTimer = setInterval(() => {
            elapsed += everyMs
            if (elapsed >= until) { this.stopWork(); return }
            this.play(id)
        }, everyMs)
    }

    stopWork() {
        if (this.workTimer) clearInterval(this.workTimer)
        this.workTimer = null
    }

    /**
     * The oxygen. One continuous breath of noise rather than a repeated one,
     * because a tank does not have a rhythm.
     */
    setHiss(on: boolean) {
        if (on === !!this.hissNodes) return
        if (!on) {
            if (this.hissNodes && this.ctx) {
                const { src, gain } = this.hissNodes
                gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08)
                try { src.stop(this.ctx.currentTime + 0.4) } catch { /* already gone */ }
            }
            this.hissNodes = null
            return
        }
        const ctx = this.wake()
        if (!ctx || !this.noise) return
        const src = ctx.createBufferSource()
        src.buffer = this.noise
        src.loop = true
        src.playbackRate.value = 0.6
        const filt = ctx.createBiquadFilter()
        filt.type = 'bandpass'
        filt.frequency.value = 3400
        filt.Q.value = 0.8
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, ctx.currentTime)
        gain.gain.setTargetAtTime(0.028, ctx.currentTime, 0.15)
        src.connect(filt); filt.connect(gain); gain.connect(this.master!)
        src.start()
        this.hissNodes = { src, gain }
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
