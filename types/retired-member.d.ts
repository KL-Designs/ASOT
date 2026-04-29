interface RetiredMember {
    _id?: import('mongodb').ObjectId
    callsign: string
    steamId?: string
    discordId?: string
    dischargeDate?: string        // ISO date YYYY-MM-DD
    dischargeYear?: number
    joinYear?: number
    dischargeType: 'GD' | 'HD' | 'DD'
    returnStatus?: 'YES' | 'NO' | 'REVIEW'
    authorisedBy?: string
    reason?: string
    ticketNumber?: string
    graceDays?: number
    importedFromCsv?: boolean
    linkedUserId?: string
    createdAt?: Date
}
