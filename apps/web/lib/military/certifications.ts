/**
 * Master list of certifications/qualifications.
 * csvHeader: the column header text in the Billet Mastersheet (used for matching at import time)
 * label:     the human-readable name stored in milpac.qualifications[].qualification
 * points:    promotion points awarded for holding this certification
 */
export const CERTIFICATIONS = [
    { csvHeader: 'Basic CQB',                     label: 'Basic CQB Course',                          points: 5  },
    { csvHeader: 'Basic Medical',                  label: 'Basic Medical Course',                      points: 5  },
    { csvHeader: 'Advanced Medical',               label: 'Advanced Medical Course',                   points: 10 },
    { csvHeader: 'Basic IDF',                      label: 'Basic Indirect Fires Course',               points: 5  },
    { csvHeader: 'DFSW',                           label: 'Direct Fires Support Weapons Course',       points: 5  },
    { csvHeader: 'Basic Rotary Wing Course',        label: 'Basic Rotary Wing Course',                  points: 5  },
    { csvHeader: 'Basic Rotary Wing Qual',          label: 'Basic Rotary Wing Assessment (Wings)',      points: 0  },
    { csvHeader: 'Advanced Rotary Wing',            label: 'Advanced Rotary Wing Course',               points: 10 },
    { csvHeader: 'Basic CAS and RECON',             label: 'Basic CAS and RECON Course',                points: 5  },
    { csvHeader: 'Advanced CAS',                   label: 'Advanced CAS Course',                       points: 10 },
    { csvHeader: 'RTO',                            label: 'Radio Telecommunications Operator Course',  points: 10 },
    { csvHeader: 'FO',                             label: 'Forward Observer Course',                   points: 15 },
    { csvHeader: 'NCO',                            label: 'Basic Staff (NCO) Course',                  points: 10 },
    { csvHeader: 'Static Line Paratrooper',         label: 'Static Line Paratrooper Course',            points: 10 },
    { csvHeader: 'Armoured Crew - Driver Basics',   label: 'Driver Basics Course',                      points: 5  },
    { csvHeader: "Armoured Crewman -  F&T's",       label: 'Driver Formations and Tactics Course',      points: 5  },
    { csvHeader: 'VCP',                            label: 'VCP',                                       points: 5  },
    { csvHeader: 'BCT 1',                          label: 'BCT 1',                                     points: 5  },
    { csvHeader: 'BCT 2',                          label: 'BCT 2',                                     points: 5  },
    { csvHeader: 'Rifle Proficiency',               label: 'Rifleman Proficiency',                      points: 5  },
    { csvHeader: 'MG Proficiency',                  label: 'Machine Gunner Proficiency',                points: 5  },
    { csvHeader: 'AT Proficiency',                  label: 'AT Gunner Proficiency',                     points: 5  },
    { csvHeader: 'GLA Proficiency',                 label: 'Grenadier Proficiency',                     points: 5  },
    { csvHeader: 'Pistol Proficiency',              label: 'Pistol Sharpshooter Proficiency',           points: 5  },
] as const

export type Certification = typeof CERTIFICATIONS[number]
