interface DischargeSnapshot {
    _id: import('mongodb').ObjectId
    userId: string       // users._id (string form)
    discordId: string    // users.id  (Discord snowflake)
    username: string
    displayName: string
    rankAtDischarge: string
    dischargeDate: string                        // YYYY-MM-DD
    dischargeType: 'honorable' | 'general' | 'dishonorable'
    enlistedDate: string
    pointsAtDischarge: number
    milpac: NonNullable<User['milpac']>          // full copy at discharge time
    archivedUniformPath: string                  // e.g. milpacs/{userId}-discharge.png
    archivedMedalPath: string                    // e.g. milpacs/{userId}-discharge-medals.png
    createdAt: Date
    createdBy: string
    createdByName: string
}
