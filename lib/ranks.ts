export type RankEntry = { name: string; abbr: string }
export type RankGroup = { group: string; ranks: RankEntry[] }

export const RANK_GROUPS: RankGroup[] = [
    {
        group: 'Entry',
        ranks: [
            { name: 'Recruit',                          abbr: 'REC'     },
        ],
    },
    {
        group: 'Infantry (Enlisted)',
        ranks: [
            { name: 'Private',                          abbr: 'PTE'     },
            { name: 'Private Proficient',               abbr: 'PTE(P)'  },
            { name: 'Leading Private',                  abbr: 'PTE(L)'  },
            { name: 'Senior Private',                   abbr: 'PTE(S)'  },
            { name: 'Senior Leading Private',           abbr: 'PTE(SL)' },
        ],
    },
    {
        group: 'ECHO — Engineers (Enlisted)',
        ranks: [
            { name: 'Sapper',                           abbr: 'SAP'     },
            { name: 'Sapper Proficient',                abbr: 'SAP(P)'  },
            { name: 'Leading Sapper',                   abbr: 'SAP(L)'  },
            { name: 'Senior Sapper',                    abbr: 'SAP(S)'  },
            { name: 'Senior Leading Sapper',            abbr: 'SAP(SL)' },
        ],
    },
    {
        group: 'GOLF — Artillery (Enlisted)',
        ranks: [
            { name: 'Gunner',                           abbr: 'GNR'     },
            { name: 'Gunner Proficient',                abbr: 'GNR(P)'  },
            { name: 'Leading Gunner',                   abbr: 'GNR(L)'  },
            { name: 'Senior Gunner',                    abbr: 'GNR(S)'  },
            { name: 'Senior Leading Gunner',            abbr: 'GNR(SL)' },
        ],
    },
    {
        group: 'VICTOR — Cavalry (Enlisted)',
        ranks: [
            { name: 'Trooper',                          abbr: 'TPR'     },
            { name: 'Trooper Proficient',               abbr: 'TPR(P)'  },
            { name: 'Leading Trooper',                  abbr: 'TPR(L)'  },
            { name: 'Senior Trooper',                   abbr: 'TPR(S)'  },
            { name: 'Senior Leading Trooper',           abbr: 'TPR(SL)' },
        ],
    },
    {
        group: 'Lance Corporal Billet (MIKE / ECHO / VICTOR)',
        ranks: [
            { name: 'Junior Lance Corporal',            abbr: 'LCPL(J)' },
            { name: 'Lance Corporal',                   abbr: 'LCPL'    },
            { name: 'Lance Corporal Proficient',        abbr: 'LCPL(P)' },
            { name: 'Leading Lance Corporal',           abbr: 'LCPL(L)' },
            { name: 'Senior Lance Corporal',            abbr: 'LCPL(S)' },
        ],
    },
    {
        group: 'Lance Bombardier Billet (GOLF)',
        ranks: [
            { name: 'Junior Lance Bombardier',          abbr: 'LBDR(J)' },
            { name: 'Lance Bombardier',                 abbr: 'LBDR'    },
            { name: 'Lance Bombardier Proficient',      abbr: 'LBDR(P)' },
            { name: 'Leading Lance Bombardier',         abbr: 'LBDR(L)' },
            { name: 'Senior Lance Bombardier',          abbr: 'LBDR(S)' },
        ],
    },
    {
        group: 'Corporal Billet (MIKE / ECHO / VICTOR)',
        ranks: [
            { name: 'Junior Corporal',                  abbr: 'CPL(J)'  },
            { name: 'Corporal',                         abbr: 'CPL'     },
            { name: 'Corporal Proficient',              abbr: 'CPL(P)'  },
            { name: 'Leading Corporal',                 abbr: 'CPL(L)'  },
            { name: 'Senior Corporal',                  abbr: 'CPL(S)'  },
        ],
    },
    {
        group: 'Bombardier Billet (GOLF)',
        ranks: [
            { name: 'Junior Bombardier',                abbr: 'BDR(J)'  },
            { name: 'Bombardier',                       abbr: 'BDR'     },
            { name: 'Bombardier Proficient',            abbr: 'BDR(P)'  },
            { name: 'Leading Bombardier',               abbr: 'BDR(L)'  },
            { name: 'Senior Bombardier',                abbr: 'BDR(S)'  },
        ],
    },
    {
        group: 'Signaller',
        ranks: [
            { name: 'Signaller',                        abbr: 'SIG'     },
            { name: 'Signaller Proficient',             abbr: 'SIG(P)'  },
            { name: 'Leading Signaller',                abbr: 'SIG(L)'  },
            { name: 'Senior Signaller',                 abbr: 'SIG(S)'  },
            { name: 'Senior Leading Signaller',         abbr: 'SIG(SL)' },
        ],
    },
    {
        group: 'SNCO — Sergeant Billet',
        ranks: [
            { name: 'Sergeant',                         abbr: 'SGT'     },
            { name: 'Staff Sergeant',                   abbr: 'SSGT'    },
            { name: 'Sergeant-at-Arms',                 abbr: 'SAM'     },
            { name: 'Senior Sergeant-at-Arms',          abbr: 'SSAM'    },
            { name: 'Platoon Sergeant Major',           abbr: 'PSM'     },
            { name: 'Platoon Technician Sergeant',      abbr: 'PTSG'    },
            { name: 'Battery Sergeant',                 abbr: 'B/SGT'   },
            { name: 'Troop Sergeant Major',             abbr: 'T/SGM'   },
        ],
    },
    {
        group: 'Officer Billet',
        ranks: [
            { name: 'Officer Cadet',                    abbr: 'OCDT'    },
            { name: '2nd Lieutenant',                   abbr: '2LT'     },
            { name: 'Lieutenant',                       abbr: 'LT'      },
            { name: 'Senior Lieutenant',                abbr: 'SLT'     },
            { name: 'Commanding Lieutenant',            abbr: 'CLT'     },
        ],
    },
    {
        group: 'Warrant Officer Billet',
        ranks: [
            { name: 'Warrant Officer 2',                abbr: 'WO2'     },
            { name: 'Warrant Officer 1',                abbr: 'WO1'     },
            { name: 'Company Sergeant Major',           abbr: 'CSM'     },
            { name: 'Regimental Sergeant Major',        abbr: 'RSM'     },
            { name: 'RSM of ASOT',                      abbr: 'RSM-A'   },
        ],
    },
    {
        group: 'Command',
        ranks: [
            { name: 'Staff Captain',                    abbr: 'SCAPT'   },
            { name: 'Captain',                          abbr: 'CAPT'    },
            { name: 'Major',                            abbr: 'MAJ'     },
            { name: 'Lieutenant Colonel',               abbr: 'LTCOL'   },
            { name: 'Colonel',                          abbr: 'COL'     },
            { name: 'Brigadier',                        abbr: 'BRIG'    },
            { name: 'Major General',                    abbr: 'MAJGEN'  },
            { name: 'Lieutenant General',               abbr: 'LTGEN'   },
            { name: 'General',                          abbr: 'GEN'     },
            { name: 'Chief of ASOT',                    abbr: 'CA'      },
        ],
    },
    {
        group: 'HOTEL — Crew',
        ranks: [
            { name: 'Aircraftsman',                     abbr: 'AC'      },
            { name: 'Leading Aircraftsman',             abbr: 'LAC'     },
            { name: 'Loadmaster',                       abbr: 'LM'      },
            { name: 'Senior Loadmaster',                abbr: 'LM(S)'   },
            { name: 'Flight Sergeant',                  abbr: 'FSGT'    },
        ],
    },
    {
        group: 'HOTEL — Pilot',
        ranks: [
            { name: 'Pilot Officer',                    abbr: 'POF'     },
            { name: 'Flying Officer',                   abbr: 'FOF'     },
            { name: 'Flight Lieutenant',                abbr: 'FLT'     },
            { name: 'Senior Flight Lieutenant',         abbr: 'FLT(S)'  },
        ],
    },
    {
        group: 'HOTEL — Officer',
        ranks: [
            { name: 'Flight Leader',                    abbr: 'FLL'     },
            { name: 'Squadron Leader',                  abbr: 'SQLD'    },
            { name: 'Wing Captain',                     abbr: 'WGCP'    },
            { name: 'Wing Commander',                   abbr: 'WGCO'    },
            { name: 'Group Captain',                    abbr: 'GPCAPT'  },
        ],
    },
    {
        group: 'HOTEL — Command',
        ranks: [
            { name: 'Commodore',                        abbr: 'COM'     },
            { name: 'Air Vice Marshal',                 abbr: 'AVM'     },
            { name: 'Air Marshal',                      abbr: 'AM'      },
            { name: 'Air Chief Marshal',                abbr: 'ACM'     },
            { name: 'Senior Air Chief Marshal',         abbr: 'SACM'    },
        ],
    },
    {
        group: 'Game Master',
        ranks: [
            { name: 'Game Master',                      abbr: 'GM'      },
            { name: 'Game Master Proficient',           abbr: 'GM(P)'   },
            { name: 'Senior Game Master',               abbr: 'GM(S)'   },
            { name: 'Grand Game Master',                abbr: 'GM(G)'   },
            { name: 'Distinguished Game Master',        abbr: 'GM(D)'   },
        ],
    },
]

export const RANKS_FLAT = RANK_GROUPS.flatMap(g => g.ranks)

/** Returns the full name for a given abbreviation, or the abbr itself as fallback. */
export function rankNameFromAbbr(abbr: string): string {
    return RANKS_FLAT.find(r => r.abbr === abbr)?.name ?? abbr
}

/** Returns the abbreviation for a given full name, or the name itself as fallback. */
export function rankAbbrFromName(name: string): string {
    return RANKS_FLAT.find(r => r.name === name)?.abbr ?? name
}
