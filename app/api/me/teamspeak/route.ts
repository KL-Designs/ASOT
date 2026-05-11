import { NextRequest, NextResponse } from 'next/server'
import { TeamSpeak, QueryProtocol } from 'ts3-nodejs-library'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

// ── helpers ──────────────────────────────────────────────────────────────────

function generateCode() {
    return Math.random().toString(36).toUpperCase().slice(2, 8)
}

async function connectTS() {
    return TeamSpeak.connect({
        host: process.env.TS_HOST!,
        queryport: Number(process.env.TS_QUERY_PORT ?? 10022),
        protocol: QueryProtocol.SSH,
        username: 'serveradmin',
        password: process.env.TS_SERVERADMIN_PASSWORD!,
        serverport: Number(process.env.TS_SERVER_PORT ?? 9987),
    })
}

/** Strips leading rank tokens (e.g. "PTE.", "[CPL]", "SGT ") from a TS nickname */
function stripRank(nickname: string) {
    return nickname.replace(/^[\[A-Z0-9()\]\.]+\s+/i, '').trim()
}

/** Expected TS nickname for a user: "[RANK] Name" or just "Name" */
function expectedNickname(user: User) {
    const stripped = user.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const full = stripped || user.globalName || user.username
    const parts = full.split(' ')
    const name = user.name || (parts.length > 1 ? parts.slice(1).join(' ') : full)
    const rank = user.milpac?.currentRank
    return rank ? `[${rank}] ${name}` : name
}

// ── route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { action } = body

    // ── init: auto-search online clients by name ──────────────────────────
    if (action === 'init') {
        const code = generateCode()
        const target = expectedNickname(me)
        const targetStripped = stripRank(target).toLowerCase()

        let ts: TeamSpeak | undefined
        try {
            ts = await connectTS()
            const online = await ts.clientList()
            const humans = online.filter(c => c.type === 0)

            // Try to find a name match
            const match = humans.find(c => {
                const stripped = stripRank(c.nickname).toLowerCase()
                return stripped === targetStripped ||
                    stripped.includes(targetStripped) ||
                    targetStripped.includes(stripped)
            })

            // Store code regardless — poke is sent only after user confirms
            await Db.users.updateOne(
                { _id: me._id },
                { $set: { tsVerifyCode: code }, $unset: { tsPending: '' } },
                { upsert: true }
            )

            if (match) {
                return NextResponse.json({ matched: true, tsNickname: match.nickname, tsClid: match.clid })
            }

            const onlineClients = humans.map(c => ({
                clid: c.clid,
                nickname: c.nickname,
            }))

            return NextResponse.json({ matched: false, onlineClients })
        } finally {
            if (ts) await ts.quit()
        }
    }

    // ── poke: manual selection — poke a chosen clid ───────────────────────
    if (action === 'poke') {
        const { clid } = body as { clid: string }

        const user = await Db.users.findOne({ _id: me._id })
        const code = user?.tsVerifyCode
        if (!code) return NextResponse.json({ error: 'Session expired. Please start again.' }, { status: 400 })

        let ts: TeamSpeak | undefined
        try {
            ts = await connectTS()
            const online = await ts.clientList()
            const target = online.find(c => c.clid === clid && c.type === 0)
            if (!target) return NextResponse.json({ error: 'That client is no longer online. Please try again.' }, { status: 404 })

            await ts.clientPoke(clid, `ASOT Website: Your link code is ${code} — enter it on the website to link your TeamSpeak account.`)

            await Db.users.updateOne(
                { _id: me._id },
                {
                    $set: {
                        tsPending: {
                            cldbid: target.databaseId,
                            uid: target.uniqueIdentifier,
                            nickname: target.nickname,
                        },
                    },
                },
                { upsert: true }
            )

            return NextResponse.json({ ok: true })
        } finally {
            if (ts) await ts.quit()
        }
    }

    // ── verify: user enters the code they received via poke ───────────────
    if (action === 'verify') {
        const { code } = body as { code: string }

        const user = await Db.users.findOne({ _id: me._id })
        if (!user?.tsVerifyCode || !user.tsPending) {
            return NextResponse.json({ error: 'No pending verification. Please start again.' }, { status: 400 })
        }
        if (code.trim().toUpperCase() !== user.tsVerifyCode.toUpperCase()) {
            return NextResponse.json({ error: 'Incorrect code. Check the poke message in TeamSpeak.' }, { status: 400 })
        }

        const nickname = stripRank(user.tsPending.nickname)

        await Db.users.updateOne(
            { _id: me._id },
            {
                $set: {
                    teamspeak: {
                        uid: user.tsPending.uid,
                        cldbid: Number(user.tsPending.cldbid),
                        nickname,
                        linkedAt: Date.now(),
                    },
                },
                $unset: { tsVerifyCode: '', tsPending: '' },
            },
            { upsert: true }
        )

        return NextResponse.json({ ok: true, nickname })
    }

    // ── notify: poke linked account with expected nickname ────────────────
    if (action === 'notify') {
        const user = await Db.users.findOne({ _id: me._id })
        if (!user?.teamspeak) return NextResponse.json({ error: 'No linked TeamSpeak account.' }, { status: 400 })

        const expected = expectedNickname(me)

        let ts: TeamSpeak | undefined
        try {
            ts = await connectTS()
            const online = await ts.clientList()
            const target = online.find(c => c.databaseId === String(user.teamspeak!.cldbid) && c.type === 0)

            if (!target) return NextResponse.json({ error: 'Your TeamSpeak account is not currently online.' }, { status: 404 })

            await ts.clientPoke(target.clid, `ASOT Website: Please update your TeamSpeak nickname to: ${expected}`)
            return NextResponse.json({ ok: true })
        } finally {
            if (ts) await ts.quit()
        }
    }

    // ── list: fetch online clients for manual selection (no auto-match) ──────
    if (action === 'list') {
        const code = generateCode()

        await Db.users.updateOne(
            { _id: me._id },
            { $set: { tsVerifyCode: code }, $unset: { tsPending: '' } },
            { upsert: true }
        )

        let ts: TeamSpeak | undefined
        try {
            ts = await connectTS()
            const online = await ts.clientList()
            const onlineClients = online
                .filter(c => c.type === 0)
                .map(c => ({ clid: c.clid, nickname: c.nickname }))
            return NextResponse.json({ onlineClients })
        } finally {
            if (ts) await ts.quit()
        }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await Db.users.updateOne(
        { _id: me._id },
        { $unset: { teamspeak: '', tsVerifyCode: '', tsPending: '' } }
    )
    return NextResponse.json({ ok: true })
}
