interface MissionFileSubmission {
    _id?: import('mongodb').ObjectId
    operationId: string
    operationTitle: string
    originalName: string
    storedName: string
    ext: string
    size: number
    version: number
    uploadedById: string
    uploadedByName: string
    uploadedAt: Date
    note?: string
}
