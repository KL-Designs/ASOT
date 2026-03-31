/**
 * Master list of awards and citations.
 * csvHeader: the column header text in the Billet Mastersheet (used for matching at import time)
 * label:     the human-readable name stored in milpac.awards[].name
 * type:      stored in milpac.awards[].type
 * points:    promotion points awarded for holding this award
 */
export const AWARDS = [
    // ── Service Citations ─────────────────────────────────────────────────────
    { csvHeader: '6 Months In ASOT Award',                        label: 'Unit Proficiency',                         type: 'Service Citation',             points: 10  },
    { csvHeader: '1 Year Service Citation',                       label: '1 Year Service Citation',                  type: 'Service Citation',             points: 15  },
    { csvHeader: '2 Year Service Citation',                       label: '2 Year Service Citation',                  type: 'Service Citation',             points: 30  },
    { csvHeader: '3 Year Service Citation',                       label: '3 Year Service Citation',                  type: 'Service Citation',             points: 45  },
    { csvHeader: '4 Years+',                                      label: '4 Year+ Service Citation',                 type: 'Service Citation',             points: 60  },

    // ── Non-Operational Awards ────────────────────────────────────────────────
    { csvHeader: 'ASOT Beyond Award',                             label: 'ASOT Beyond Award',                        type: 'Non-Operational Award',        points: 100 },
    { csvHeader: 'Broken Lance Award',                            label: 'Broken Lance Award',                       type: 'Non-Operational Award',        points: 10  },
    { csvHeader: 'Diplomat Award',                                label: 'Diplomat Award',                           type: 'Non-Operational Award',        points: 10  },
    { csvHeader: 'Instructor Award',                              label: 'Instructor Award',                         type: 'Non-Operational Award',        points: 15  },
    { csvHeader: 'Public Relations Award',                        label: 'Public Relations Award',                   type: 'Non-Operational Award',        points: 10  },
    { csvHeader: 'Group Development Award',                       label: 'Group Development Award',                  type: 'Non-Operational Award',        points: 15  },
    { csvHeader: 'Architect Award',                               label: 'Architect Award',                          type: 'Non-Operational Award',        points: 25  },
    { csvHeader: 'Watchman Award',                                label: 'Watchman Award',                           type: 'Non-Operational Award',        points: 20  },
    { csvHeader: 'Atlas Award',                                   label: 'Atlas Award',                              type: 'Non-Operational Award',        points: 30  },
    { csvHeader: 'Bronze Soldiers Medallion',                     label: 'Bronze Soldiers Medallion',                type: 'Non-Operational Award',        points: 10  },
    { csvHeader: 'Silver Soldiers Medallion',                     label: 'Silver Soldiers Medallion',                type: 'Non-Operational Award',        points: 20  },
    { csvHeader: 'Gold Soldiers Medallion',                       label: 'Gold Soldiers Medallion',                  type: 'Non-Operational Award',        points: 40  },
    { csvHeader: 'Founding Member',                               label: 'Founding Member',                          type: 'Non-Operational Award',        points: 75  },

    // ── Campaign Medallions ───────────────────────────────────────────────────
    { csvHeader: 'Campaign Medallion',                            label: 'Campaign Medallion',                       type: 'Operational Service Citation', points: 3   },
    { csvHeader: 'Campaign Medallion First Clasp',                label: 'Campaign Medallion Tier 1',                type: 'Operational Service Citation', points: 10  },
    { csvHeader: 'Campaign Medallion Second Clasp',               label: 'Campaign Medallion Tier 2',                type: 'Operational Service Citation', points: 10  },
    { csvHeader: 'Campaign Medallion Third Clasp',                label: 'Campaign Medallion Tier 3',                type: 'Operational Service Citation', points: 15  },
    { csvHeader: 'Campaign Medallion Fourth Clasp',               label: 'Campaign Medallion Tier 4',                type: 'Operational Service Citation', points: 15  },
    { csvHeader: 'Campaign Medallion, Tier 2 First Clasp',        label: 'Campaign Medallion Tier 2 First Clasp',    type: 'Operational Service Citation', points: 20  },
    { csvHeader: 'Campagin Medallion, Tier 2 Second Clasp',       label: 'Campaign Medallion Tier 2 Second Clasp',   type: 'Operational Service Citation', points: 20  },
    { csvHeader: 'Campagin Medallion, Tier 2 Third Clasp',        label: 'Campaign Medallion Tier 2 Third Clasp',    type: 'Operational Service Citation', points: 20  },
    { csvHeader: 'Campagin Medallion, Tier 2 Fourth Clasp',       label: 'Campaign Medallion Tier 2 Fourth Clasp',   type: 'Operational Service Citation', points: 20  },
    { csvHeader: 'Campagin Medallion, Tier 3 First Clasp',        label: 'Campaign Medallion Tier 3 First Clasp',    type: 'Operational Service Citation', points: 25  },
    { csvHeader: 'Campagin Medallion, Tier 3 Second Clasp',       label: 'Campaign Medallion Tier 3 Second Clasp',   type: 'Operational Service Citation', points: 25  },
    { csvHeader: 'Campagin Medallion, Tier 3 Third Clasp',        label: 'Campaign Medallion Tier 3 Third Clasp',    type: 'Operational Service Citation', points: 25  },
    { csvHeader: 'Campagin Medallion, Tier 3 Fourth Clasp',       label: 'Campaign Medallion Tier 3 Fourth Clasp',   type: 'Operational Service Citation', points: 25  },
    { csvHeader: 'Campagin Medallion, Tier 4 First Clasp',        label: 'Campaign Medallion Tier 4 First Clasp',    type: 'Operational Service Citation', points: 25  },
    { csvHeader: 'Campagin Medallion, Tier 4 Second Clasp',       label: 'Campaign Medallion Tier 4 Second Clasp',   type: 'Operational Service Citation', points: 25  },
    { csvHeader: 'Campagin Medallion, Tier 4 Third Clasp',        label: 'Campaign Medallion Tier 4 Third Clasp',    type: 'Operational Service Citation', points: 25  },
    { csvHeader: 'Campagin Medallion, Tier 4 Fourth Clasp',       label: 'Campaign Medallion Tier 4 Fourth Clasp',   type: 'Operational Service Citation', points: 25  },

    // ── Gallantry ─────────────────────────────────────────────────────────────
    { csvHeader: 'Gallantry Award',                               label: 'Gallantry Award',                          type: 'Non-Operational Award',        points: 30  },
    { csvHeader: 'Star of Courage',                               label: 'Star of Courage',                          type: 'Non-Operational Award',        points: 40  },
    { csvHeader: 'ASOT Cross of Valour',                          label: 'ASOT Cross of Valour',                     type: 'Non-Operational Award',        points: 50  },

    // ── Leadership ────────────────────────────────────────────────────────────
    { csvHeader: 'Protagonist Award',                             label: 'Protagonist Award',                        type: 'Non-Operational Award',        points: 10  },
    { csvHeader: 'Junior Leadership Award',                       label: 'Junior Leadership Award',                  type: 'Non-Operational Award',        points: 20  },
    { csvHeader: 'Senior Leadership Award',                       label: 'Senior Leadership Award',                  type: 'Non-Operational Award',        points: 25  },

    // ── Specialist ────────────────────────────────────────────────────────────
    { csvHeader: 'Rotary Aviation Medal',                         label: 'Rotary Aviation Medal',                    type: 'Non-Operational Award',        points: 20  },
    { csvHeader: 'Medical Medallion',                             label: 'Medical Medallion',                        type: 'Non-Operational Award',        points: 30  },
] as const

export type Award = typeof AWARDS[number]
