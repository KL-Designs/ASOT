import { CalendarToday } from '@mui/icons-material'
import Avatar from '@/components/member/avatar'
import { Badge, Grid2, PageHead, Stack } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

import BioCard from './_components/BioCard'
import TimezoneCard from './_components/TimezoneCard'
import TeamSpeakCard from './_components/TeamSpeakCard'
import SecurityCard from './_components/SecurityCard'

/* ============================================================================
   The member's own profile.

   Lives under /dashboard, and is rendered by /me as well for the members who
   cannot open the dashboard at all — no department, no ORBAT position. Moving
   it wholesale would have taken a recruit's bio, timezone and TeamSpeak link
   away from them, so one implementation serves both entry points.

   The Roles column is gone. It listed every Discord role the member holds,
   which is an implementation detail of how access is granted rather than
   anything they can act on, and it took a fifth of the page to say it.
   ========================================================================== */

export interface ProfileScreenProps {
    me: User
    /** From the ORBAT, for the posting line under the name. */
    orbatRole: string | null
    displayName: string
    rank: string | null
    rankAbbr: string | null
    callsign: string | null
    isHQ: boolean
}

export default function ProfileScreen({
    me, orbatRole, displayName, rank, rankAbbr, callsign, isHQ,
}: ProfileScreenProps) {
    const joined = me.guild?.joinedTimestamp
        ? new Date(me.guild.joinedTimestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
        : null

    return (
        /*
           `.dash` carries the tokens for the standalone /me render, which is
           outside the shell that normally provides them. Its own background is
           overridden to --workspace: `.dash` paints --ink-0, which is two
           shades darker than the column this sits in, so a short profile drew a
           dark block that stopped where the content did and left a visible seam
           down the rest of the page.
        */
        <div
            className={s.dash}
            style={{
                background: 'var(--workspace)',
                minHeight: '100%',
                padding: 'var(--gap)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--gap)',
            }}
        >

            {/* The identity block replaces the kicker/title pair outright —
                on your own profile the avatar *is* the heading. */}
            <PageHead
                title={displayName}
                right={joined ? (
                    <span className={s.hint} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CalendarToday style={{ fontSize: 11 }} />
                        Joined {joined}
                    </span>
                ) : null}
            >
                <div className='flex items-center gap-4' style={{ minWidth: 0 }}>
                    <div className='relative shrink-0' style={{ width: 62, height: 62 }}>
                        <Avatar user={me} />
                    </div>
                    <div className='flex flex-col gap-2' style={{ minWidth: 0 }}>
                        <div className={s.k}>ASOT // Member</div>
                        <h2 style={{ margin: 0, fontFamily: 'var(--font-disp)', fontSize: 26, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', lineHeight: 1, color: 'var(--txt-1)' }}>
                            {displayName}
                        </h2>
                        <div className='flex flex-wrap gap-2'>
                            {rank && <Badge tone='info'>{rank}</Badge>}
                            {orbatRole && <Badge tone='muted'>{orbatRole}</Badge>}
                            {callsign && <Badge tone='muted'>{callsign}</Badge>}
                        </div>
                    </div>
                </div>
            </PageHead>

            <Grid2>
                <Stack>
                    <BioCard canUploadImage={isHQ} />
                </Stack>
                <Stack>
                    <TeamSpeakCard
                        linked={me.teamspeak ? { cldbid: me.teamspeak.cldbid, linkedAt: me.teamspeak.linkedAt } : null}
                        expectedNickname={rankAbbr ? `[${rankAbbr}] ${displayName}` : displayName}
                    />
                    <TimezoneCard initialTimezone={me.timezone ?? null} />
                    <SecurityCard />
                </Stack>
            </Grid2>
        </div>
    )
}
