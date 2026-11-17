import { describe, expect, it } from 'vitest'
import {
    buildMissionMakerInput, hasMissionMakerInput, missionMakerKey, missionMakerSignature, type MissionMakerSource,
} from './aar-mission-maker'

const src = (over: Partial<MissionMakerSource> = {}): MissionMakerSource => ({
    aars: [
        { id: 'a1', section: 'Alpha', fix: 'Enemy spawned behind us', improve: '', sustain: 'Good briefing', updatedAt: '2026-11-01T00:00:00.000Z' },
        { id: 'a2', section: 'Bravo', fix: '', improve: '', sustain: '', updatedAt: '2026-11-01T00:00:00.000Z' },
    ],
    feedback: [
        { id: 'f1', server: 3, combat: 4, story: 5, enjoyment: 4, comment: 'Loved the convoy ambush', updatedAt: '2026-11-01T00:00:00.000Z' },
        { id: 'f2', server: 2, combat: 2, story: 3, enjoyment: null, comment: '', updatedAt: '2026-11-01T00:00:00.000Z' },
    ],
    ...over,
})

describe('mission maker summary (row 342)', () => {
    it('keys one summary per operation', () => {
        expect(missionMakerKey('abc')).toBe('mission-maker|abc')
    })

    it('signature moves when an AAR or a feedback form changes, not when order does', () => {
        const base = src()
        const same = src({ aars: [...base.aars].reverse() })
        expect(missionMakerSignature(same)).toBe(missionMakerSignature(base))
        const edited = src({ feedback: [{ ...base.feedback[0], updatedAt: '2026-11-02T00:00:00.000Z' }, base.feedback[1]] })
        expect(missionMakerSignature(edited)).not.toBe(missionMakerSignature(base))
    })

    it('needs some written text, not only scores', () => {
        expect(hasMissionMakerInput(src())).toBe(true)
        expect(hasMissionMakerInput(src({ aars: [], feedback: [{ id: 'f', server: 3, combat: 3, story: 3, comment: ' ', updatedAt: 'x' }] }))).toBe(false)
    })

    it('sends scores, comments and non-empty AARs, never names', () => {
        const text = buildMissionMakerInput('Op Test', src())
        expect(text).toContain('Operation: Op Test')
        expect(text).toContain('Feedback forms: 2')
        expect(text).toContain('Combat and action: 3.0')
        expect(text).toContain('Loved the convoy ambush')
        expect(text).toContain('[AAR · Alpha]')
        expect(text).not.toContain('[AAR · Bravo]')
        expect(text).toContain('Reports included: 2')
    })

    it('drops what does not fit and says so', () => {
        const text = buildMissionMakerInput('Op', src(), 60)
        expect(text).toMatch(/did not fit/)
    })
})
