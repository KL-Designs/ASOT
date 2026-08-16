/**
 * Rank track definitions with point thresholds for each billet.
 * minPts: null = "Billet Rank" (assigned by leadership, not earned by points alone).
 * Mike = Infantry.
 */

import type { RankAbbr } from '@asot/lib'

export interface RankThreshold {
    /**
     * Typed against the authoritative rank list in lib/ rather
     * than `string`. This file previously carried tracks for `SLT` and `CLT`
     * long after those ranks were renamed `LT(S)` and `LT(C)`, so two tracks
     * pointed at ranks that no longer existed and two real ranks had no
     * promotion path. Nothing caught it because the field was a bare string.
     */
    abbr:    RankAbbr
    minPts:  number | null  // null = billet assignment only
}

export interface RankTrack {
    id:    string
    ranks: RankThreshold[]
}

export const RANK_TRACKS: RankTrack[] = [
    // ── Infantry / Support ────────────────────────────────────────────────────

    // MIKE (Infantry) — PTE billet
    { id: 'pte', ranks: [
        { abbr: 'PTE',      minPts: 0   },
        { abbr: 'PTE(P)',   minPts: 76  },
        { abbr: 'PTE(L)',   minPts: 151 },
        { abbr: 'PTE(S)',   minPts: 251 },
        { abbr: 'PTE(SL)', minPts: 451 },
    ]},

    // ECHO (Engineers) — Sapper billet
    { id: 'sap', ranks: [
        { abbr: 'SAP',      minPts: 0   },
        { abbr: 'SAP(P)',   minPts: 76  },
        { abbr: 'SAP(L)',   minPts: 151 },
        { abbr: 'SAP(S)',   minPts: 251 },
        { abbr: 'SAP(SL)', minPts: 451 },
    ]},

    // GOLF (Artillery) — Gunner billet
    { id: 'gnr', ranks: [
        { abbr: 'GNR',      minPts: 0   },
        { abbr: 'GNR(P)',   minPts: 76  },
        { abbr: 'GNR(L)',   minPts: 151 },
        { abbr: 'GNR(S)',   minPts: 251 },
        { abbr: 'GNR(SL)', minPts: 451 },
    ]},

    // VICTOR (Cavalry) — Trooper billet
    { id: 'tpr', ranks: [
        { abbr: 'TPR',      minPts: 0   },
        { abbr: 'TPR(P)',   minPts: 76  },
        { abbr: 'TPR(L)',   minPts: 151 },
        { abbr: 'TPR(S)',   minPts: 251 },
        { abbr: 'TPR(SL)', minPts: 451 },
    ]},

    // LCPL billet (MIKE / ECHO / VICTOR)
    { id: 'lcpl', ranks: [
        { abbr: 'LCPL(J)', minPts: null },
        { abbr: 'LCPL',    minPts: 175  },
        { abbr: 'LCPL(P)', minPts: 251  },
        { abbr: 'LCPL(L)', minPts: 326  },
        { abbr: 'LCPL(S)', minPts: 475  },
    ]},

    // LBDR billet (GOLF)
    { id: 'lbdr', ranks: [
        { abbr: 'LBDR(J)', minPts: null },
        { abbr: 'LBDR',    minPts: 175  },
        { abbr: 'LBDR(P)', minPts: 251  },
        { abbr: 'LBDR(L)', minPts: 326  },
        { abbr: 'LBDR(S)', minPts: 475  },
    ]},

    // CPL billet (MIKE / ECHO / VICTOR)
    { id: 'cpl', ranks: [
        { abbr: 'CPL(J)', minPts: null },
        { abbr: 'CPL',    minPts: 226  },
        { abbr: 'CPL(P)', minPts: 301  },
        { abbr: 'CPL(L)', minPts: 376  },
        { abbr: 'CPL(S)', minPts: 526  },
    ]},

    // BDR billet (GOLF)
    { id: 'bdr', ranks: [
        { abbr: 'BDR(J)', minPts: null },
        { abbr: 'BDR',    minPts: 226  },
        { abbr: 'BDR(P)', minPts: 301  },
        { abbr: 'BDR(L)', minPts: 376  },
        { abbr: 'BDR(S)', minPts: 526  },
    ]},

    // SNCO billet — MIKE top: PSM
    { id: 'snco-mike', ranks: [
        { abbr: 'SGT',  minPts: null },
        { abbr: 'SSGT', minPts: 400  },
        { abbr: 'SAM',  minPts: 476  },
        { abbr: 'SSAM', minPts: 551  },
        { abbr: 'PSM',  minPts: 701  },
    ]},

    // SNCO billet — ECHO top: PTSG
    { id: 'snco-echo', ranks: [
        { abbr: 'SGT',  minPts: null },
        { abbr: 'SSGT', minPts: 400  },
        { abbr: 'SAM',  minPts: 476  },
        { abbr: 'SSAM', minPts: 551  },
        { abbr: 'PTSG', minPts: 701  },
    ]},

    // SNCO billet — GOLF top: B/SGT
    { id: 'snco-golf', ranks: [
        { abbr: 'SGT',   minPts: null },
        { abbr: 'SSGT',  minPts: 400  },
        { abbr: 'SAM',   minPts: 476  },
        { abbr: 'SSAM',  minPts: 551  },
        { abbr: 'B/SGT', minPts: 701  },
    ]},

    // SNCO billet — VICTOR top: T/SGM
    { id: 'snco-victor', ranks: [
        { abbr: 'SGT',   minPts: null },
        { abbr: 'SSGT',  minPts: 400  },
        { abbr: 'SAM',   minPts: 476  },
        { abbr: 'SSAM',  minPts: 551  },
        { abbr: 'T/SGM', minPts: 701  },
    ]},

    // Officer billet (all tracks)
    { id: 'officer', ranks: [
        { abbr: 'OCDT', minPts: null },
        { abbr: '2LT',  minPts: 451  },
        { abbr: 'LT',   minPts: 526  },
        { abbr: 'LT(S)', minPts: 601 },
        { abbr: 'LT(C)', minPts: 751 },
    ]},

    // Warrant Officer billet
    { id: 'wo', ranks: [
        { abbr: 'WO2',   minPts: null },
        { abbr: 'WO1',   minPts: 401  },
        { abbr: 'CSM',   minPts: 501  },
        { abbr: 'RSM',   minPts: 651  },
        { abbr: 'RSM-A', minPts: 800  },
    ]},

    // Command — CHQ tier (SCAPT → CAPT → MAJ → LTCOL)
    { id: 'command-chq', ranks: [
        { abbr: 'SCAPT', minPts: null },
        { abbr: 'CAPT',  minPts: 550  },
        { abbr: 'MAJ',   minPts: 701  },
        { abbr: 'LTCOL', minPts: 900  },
    ]},

    // Command — Regiment tier (LTCOL billet entry → COL → BRIG → MAJGEN)
    { id: 'command-regt', ranks: [
        { abbr: 'LTCOL',  minPts: null },
        { abbr: 'COL',    minPts: 600  },
        { abbr: 'BRIG',   minPts: 751  },
        { abbr: 'MAJGEN', minPts: 950  },
    ]},

    // Command — High Command (MAJGEN billet entry → LTGEN → GEN → CA)
    { id: 'command-high', ranks: [
        { abbr: 'MAJGEN', minPts: null  },
        { abbr: 'LTGEN',  minPts: 1400 },
        { abbr: 'GEN',    minPts: 1701 },
        { abbr: 'CA',     minPts: 2000 },
    ]},

    // Signaller billet
    { id: 'sig', ranks: [
        { abbr: 'SIG',    minPts: 0   },
        { abbr: 'SIG(P)', minPts: 76  },
        { abbr: 'SIG(L)', minPts: 151 },
        { abbr: 'SIG(S)', minPts: 251 },
        { abbr: 'SIG(SL)',minPts: 451 },
    ]},

    // Game Master billet
    { id: 'gm', ranks: [
        { abbr: 'GM',    minPts: 0   },
        { abbr: 'GM(P)', minPts: 76  },
        { abbr: 'GM(S)', minPts: 151 },
        { abbr: 'GM(G)', minPts: 251 },
        { abbr: 'GM(D)', minPts: 451 },
    ]},

    // ── Hotel (Aviation) ──────────────────────────────────────────────────────

    // Hotel Crew billet
    { id: 'hotel-crew', ranks: [
        { abbr: 'AC',    minPts: 0   },
        { abbr: 'LAC',   minPts: 76  },
        { abbr: 'LM',    minPts: 151 },
        { abbr: 'LM(S)', minPts: 251 },
        { abbr: 'FSGT',  minPts: 451 },
    ]},

    // Hotel Pilot billet
    { id: 'hotel-pilot', ranks: [
        { abbr: 'POF',    minPts: null },
        { abbr: 'FOF',    minPts: 100  },
        { abbr: 'FLT',    minPts: 225  },
        { abbr: 'FLT(S)', minPts: 451  },
    ]},

    // Hotel Officer billet
    { id: 'hotel-officer', ranks: [
        { abbr: 'FLL',    minPts: null },
        { abbr: 'SQLD',   minPts: 226  },
        { abbr: 'WGCP',   minPts: 301  },
        { abbr: 'WGCO',   minPts: 376  },
        { abbr: 'GPCAPT', minPts: 526  },
    ]},

    // Hotel Command billet
    { id: 'hotel-command', ranks: [
        { abbr: 'COM',  minPts: null },
        { abbr: 'AVM',  minPts: 400  },
        { abbr: 'AM',   minPts: 476  },
        { abbr: 'ACM',  minPts: 551  },
        { abbr: 'SACM', minPts: 701  },
    ]},
]

/**
 * Given a rank abbreviation and point total, returns the suggested rank abbreviation
 * within the same billet track, or null if the rank is unrecognized or purely
 * billet-assigned (leadership decision, no point threshold).
 *
 * For shared SNCO ranks (SGT/SSGT/SAM/SSAM) where the track cannot be inferred
 * from the abbreviation alone, defaults to the MIKE (Infantry) SNCO track.
 */
export function getSuggestedRank(currentRankAbbr: string, points: number): string | null {
    const matchingTracks = RANK_TRACKS.filter(t =>
        t.ranks.some(r => r.abbr === currentRankAbbr)
    )
    if (matchingTracks.length === 0) return null

    // Prefer a track where the current rank has a point threshold (not a pure billet entry)
    const track =
        matchingTracks.find(t => {
            const entry = t.ranks.find(r => r.abbr === currentRankAbbr)
            return entry?.minPts !== null
        }) ?? matchingTracks[0]

    const qualifying = track.ranks.filter(r => r.minPts !== null && r.minPts <= points)
    if (qualifying.length === 0) return null

    return qualifying[qualifying.length - 1].abbr
}
