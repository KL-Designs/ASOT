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
    /** Department codes and DepartmentRole ids they held, which the discharge
     *  clears from the user. Absent on snapshots taken before the discharge
     *  clean-up existed (lib/orbat/discharge-cleanup.ts). */
    departmentsAtDischarge?: string[]
    departmentRoleIdsAtDischarge?: string[]
    archivedUniformPath: string                  // e.g. milpacs/{userId}-discharge.png
    archivedMedalPath: string                    // e.g. milpacs/{userId}-discharge-medals.png
    createdAt: Date
    createdBy: string
    createdByName: string
}
