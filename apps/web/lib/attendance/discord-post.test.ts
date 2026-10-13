import { describe, expect, test } from 'vitest'
import type { SlotView } from '@/lib/attendance/roster'
import {
    DEFAULT_TIMINGS, buildPostMessage, buttonId, formatDuration, postKindFor, refreshDue, resolveDetails,
    cardHeight, packColumns, rosterFingerprint, sanitiseDetails, summariseRoster,
} from './discord-post'

const slot = (over: Partial<SlotView> & { id: string }): SlotView => ({
    category: 'platoon11', sectionTitle: '1-1 Alpha', role: 'Rifleman', roleId: null, order: 0,
    homeUserId: null, occupantUserId: null, state: 'open', vacatedBy: null, available: true, ...over,
})

const NAMES: Record<string, string> = { sgt: 'SGT Okafor', rfn: 'PTE Lee', gm: 'CPL Zeus', out: 'PTE Away' }
const nameOf = (id: string) => NAMES[id] ?? id

describe('postKindFor', () => {
    test('the weekend is a main mission, in the unit\'s own timezone', () => {
        // Saturday 19:00 in Sydney is still Saturday there (09:00 UTC).
        expect(postKindFor(new Date('2026-10-17T09:00:00Z'))).toBe('main')
        // Sunday 22:00 UTC is already Monday in Sydney.
        expect(postKindFor(new Date('2026-10-18T22:00:00Z'))).toBe('midweek')
        expect(postKindFor(new Date('2026-10-14T09:00:00Z'))).toBe('midweek')
    })
})

describe('details', () => {
    test('sanitiseDetails keeps what is usable and drops the rest', () => {
        expect(sanitiseDetails({
            kind: 'weekly', timings: { staffLoadIn: -90, stepOff: 'soon', missionEnd: 99999 },
            serverAddress: ' play.example.com ', serverPort: '2302abc', serverPassword: ' hunter2 ', modlistUrl: 'javascript:alert(1)',
        })).toEqual({ timings: { staffLoadIn: -90 }, serverAddress: 'play.example.com', serverPort: '2302', serverPassword: 'hunter2' })
    })

    test('an operation\'s own details win over the site defaults, which win over the usual timings', () => {
        const date = new Date('2026-10-17T09:00:00Z')
        const resolved = resolveDetails(date, { timings: { missionEnd: 240 }, serverPassword: 'opnight' }, { serverAddress: 'play.example.com', serverPassword: 'default' })
        expect(resolved.kind).toBe('main')
        expect(resolved.timings).toEqual({ ...DEFAULT_TIMINGS.main, missionEnd: 240 })
        expect(resolved.serverAddress).toBe('play.example.com')
        expect(resolved.serverPassword).toBe('opnight')
    })

    test('a kind set on the operation overrides the weekday', () => {
        expect(resolveDetails(new Date('2026-10-17T09:00:00Z'), { kind: 'midweek' }).timings).toEqual(DEFAULT_TIMINGS.midweek)
    })
})

describe('summariseRoster', () => {
    const slots = [
        slot({ id: 'a1', order: 1, role: 'Section Commander', homeUserId: 'sgt', occupantUserId: 'sgt', state: 'held' }),
        slot({ id: 'a2', order: 2, homeUserId: 'out', occupantUserId: null, state: 'declined', vacatedBy: 'out' }),
        slot({ id: 'a3', order: 3, occupantUserId: 'rfn', state: 'backfilled' }),
        slot({ id: 'a4', order: 4, homeUserId: 'quiet', occupantUserId: 'quiet', state: 'awaiting' }),
        slot({ id: 'g1', order: 9, category: 'gamemaster', sectionTitle: '', occupantUserId: 'gm', state: 'held' }),
    ]
    const rsvp = { sgt: 'attending' as const, rfn: 'attending' as const, out: 'not_attending' as const, quiet: null }
    const summary = summariseRoster(slots, rsvp, nameOf)

    test('lists who is actually playing in each callsign, in slot order', () => {
        expect(summary.sections).toEqual([{
            category: 'platoon11', title: '1-1 Alpha', total: 4,
            members: [{ name: 'SGT Okafor', role: 'Section Commander' }, { name: 'PTE Lee', role: 'Rifleman' }],
        }])
    })

    test('game masters are their own list, and not a callsign', () => {
        expect(summary.gamemasters).toEqual(['CPL Zeus'])
    })

    test('somebody who has not answered is not listed as coming', () => {
        expect(summary.attending).toBe(3)
        expect(JSON.stringify(summary)).not.toContain('quiet')
    })

    test('those who said no are listed by name', () => {
        expect(summary.notAttending).toEqual(['PTE Away'])
    })

    test('the fingerprint moves when the picture would, and only then', () => {
        const same = summariseRoster(slots, rsvp, nameOf)
        expect(rosterFingerprint(same)).toBe(rosterFingerprint(summary))
        const changed = summariseRoster(slots, { ...rsvp, quiet: 'not_attending' }, nameOf)
        expect(rosterFingerprint(changed)).not.toBe(rosterFingerprint(summary))
    })
})

describe('refreshDue', () => {
    const now = new Date('2026-10-17T09:10:00Z')

    test('at most once per interval', () => {
        expect(refreshDue(new Date('2026-10-17T09:06:00Z'), now, 5)).toBe(false)
        expect(refreshDue(new Date('2026-10-17T09:05:00Z'), now, 5)).toBe(true)
    })

    test('never drawn means draw now', () => {
        expect(refreshDue(null, now, 5)).toBe(true)
    })
})

describe('buildPostMessage', () => {
    const date = new Date('2026-10-17T09:00:00Z')
    const input = {
        operationId: 'abc123', title: 'Operation Iron Compass', date, closesAt: new Date('2026-10-17T08:00:00Z'),
        details: resolveDetails(date, { serverAddress: 'play.example.com', serverPort: '2302', serverPassword: 'hunter2', modlistUrl: 'https://example.com/mods' }),
        summary: { sections: [], gamemasters: [], notAttending: ['PTE Away'], attending: 12 },
        baseUrl: 'https://asot.example', open: true, colour: '#3366ff',
    }
    const message = buildPostMessage(input)
    const embed = message.embeds[0]
    const field = (name: string) => embed.fields.find(f => f.name === name)?.value ?? ''

    test('times are Discord timestamps, so each reader sees their own timezone', () => {
        const start = Math.floor(date.getTime() / 1000)
        expect(field('Starts')).toContain(`<t:${start}:F>`)
        // Staff load in is an hour before the start on a main mission.
        expect(field('Timings')).toContain(`<t:${start - 3600}:t>  Staff load in`)
        expect(field('Timings').split('\n')).toHaveLength(5)
    })

    test('carries the duration, the server and the links', () => {
        expect(field('Duration')).toBe('3 h')
        expect(field('Server')).toBe('`play.example.com:2302`\nPassword: ||hunter2||')
        expect(field('Modlist')).toContain('https://example.com/mods')
        expect(field('Orders')).toContain('https://asot.example/operations/abc123')
        expect(field('Signed up')).toBe('12 attending · 1 not attending')
        expect(embed.color).toBe(0x3366ff)
    })

    test('has the sign-up buttons the bot handles, and a link to the board', () => {
        const buttons = message.components[0].components
        expect(buttons.map(b => 'custom_id' in b ? b.custom_id : b.url)).toEqual([
            buttonId('abc123', 'yes'), buttonId('abc123', 'no'), 'https://asot.example/operations/abc123/attendance',
        ])
        expect(buttonId('abc123', 'yes')).toBe('attendance.abc123.yes')
    })

    test('shows the roster picture and replaces it on an edit', () => {
        expect(embed.image.url).toBe('attachment://roster.png')
        expect(message.attachments).toEqual([{ id: 0, filename: 'roster.png' }])
    })

    test('mentions nobody', () => {
        expect(message.allowed_mentions.parse).toEqual([])
    })

    test('once sign-ups close the buttons go and the title says so', () => {
        const closed = buildPostMessage({ ...input, open: false })
        expect(closed.embeds[0].title).toBe('Operation Iron Compass · Sign-ups closed')
        expect(closed.components[0].components).toHaveLength(1)
        expect(closed.embeds[0].fields.some(f => f.name === 'Sign-ups closed')).toBe(true)
    })

    test('with no server set, there is no server field', () => {
        const bare = buildPostMessage({ ...input, details: resolveDetails(date, null) })
        expect(bare.embeds[0].fields.some(f => f.name === 'Server' || f.name === 'Modlist')).toBe(false)
    })
})

describe('formatDuration', () => {
    test('reads as hours and minutes', () => {
        expect(formatDuration(180)).toBe('3 h')
        expect(formatDuration(150)).toBe('2 h 30 min')
        expect(formatDuration(45)).toBe('45 min')
    })
})

describe('packColumns', () => {
    const section = (n: number) => ({ members: Array.from({ length: n }, (_, i) => ({ name: `m${i}`, role: '' })) })

    test('deals each card to the shortest column', () => {
        const { columns } = packColumns([section(8), section(1), section(1), section(1)], 2)
        expect(columns.map(c => c.map(s => s.members.length))).toEqual([[8], [1, 1, 1]])
    })

    test('an empty callsign still takes a row', () => {
        expect(cardHeight(section(0))).toBe(cardHeight(section(1)))
    })

    test('reports the tallest column', () => {
        const { height } = packColumns([section(4), section(2)], 2)
        expect(height).toBe(cardHeight(section(4)) + 14)
    })

    test('nothing to lay out is zero tall', () => {
        expect(packColumns([], 4).height).toBe(0)
    })
})
