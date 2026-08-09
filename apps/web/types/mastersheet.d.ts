// Per-member imported-only fields from the Billet Mastersheet CSV that have
// no existing website equivalent. Stored separately so the live Billet view
// can clearly distinguish website data from imported-only data.
interface BilletExtra {
    _id: import('mongodb').ObjectId
    memberName: string        // name as it appeared in the CSV
    memberId?: string         // matched _id in users collection (null if unmatched)
    billet: string
    upToDate: boolean
    lastUpdate: string
    importedAt: Date
    dischargedSection?: boolean  // true when the row appeared in the Discharged section of the imported CSV
}

interface ClassificationSignals {
    hasFormalDischarge: boolean    // user.discharged field exists
    inLeavingHistory: boolean      // matched in leaving_history by discord ID or name
    inDischargedSection: boolean   // in discharged section of imported billet CSV
    hasAsotMemberRole: boolean     // has the ASOT Member discord role
    onOrbat: boolean               // has an assigned ORBAT position
    hasRank: boolean               // milpac.currentRank is set
    finalClassification: 'active' | 'discharged'
}

interface LeavingHistoryRecord {
    _id: import('mongodb').ObjectId
    dischargeTicket?: string
    name: string
    steamId?: string
    discordId?: string
    leavingDate: string
    grace: string
    type: 'GD' | 'HD' | 'DD' | string
    return: 'YES' | 'REVIEW' | 'NO' | 'Indefinite' | 'Expired' | string
    authorisedBy: string
    reason: string
    notes?: string
    importedAt: Date
}

interface DeniedApplicationRecord {
    _id: import('mongodb').ObjectId
    date: string
    name: string
    steamId?: string
    discordId?: string
    reason: string
    deniedBy: string
    importedAt: Date
}

interface MemberEmail {
    _id: import('mongodb').ObjectId
    memberId: string
    emails: { email: string; addedAt: Date; addedByName: string }[]
}

interface DisciplineRecord {
    _id: import('mongodb').ObjectId
    disciplineLevel: string
    name: string
    issued: string
    expires: string
    expired: boolean
    givenBy: string
    authorisedBy: string
    pointsRemoved?: number
    reason: string
    importedAt: Date
}

interface MastersheetRecycleBinEntry {
    _id: import('mongodb').ObjectId
    originalTab: 'billet' | 'leaving' | 'denied' | 'discipline'
    originalId: string
    record: unknown
    deletedAt: Date
    deletedBy: string
    deletedByName: string
}
