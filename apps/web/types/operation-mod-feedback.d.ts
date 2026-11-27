interface OperationModFeedback {
    _id?: import('mongodb').ObjectId
    operationId: string
    operationTitle: string
    modName: string
    workshopUrl?: string
    /** Description of the issue or observation */
    issue: string
    severity: 'minor' | 'major' | 'critical'
    submittedById: string
    submittedByName: string
    submittedAt: Date
    /** Set once this feedback was used to create a ModEntry */
    addedToDbAt?: Date
    addedToDbById?: string
    addedToDbByName?: string
    /** ID of the resulting ModEntry */
    modEntryId?: string
}
