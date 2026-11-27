interface TrainingDocChangeEntry {
    version: number
    summary: string
    addedAt: Date
    addedById: string
    addedByName: string
    requiresAck: boolean
}

interface TrainingDocItem {
    _id?: import('mongodb').ObjectId
    type: 'folder' | 'document'
    name: string
    parentId: import('mongodb').ObjectId | null
    // document-only
    htmlContent?: string
    imageFiles?: string[]        // stored filenames in uploads/training-docs/
    originalFileName?: string    // set for Google Docs zip uploads; absent for new blank docs
    changeLog?: TrainingDocChangeEntry[]
    // visual customisation
    iconName?: string            // MUI icon name, e.g. "School", "MenuBook"
    color?: string               // hex color, e.g. "#2e7d32"
    // metadata
    createdAt: Date
    updatedAt: Date
    createdById: string
    createdByName: string
    updatedByName?: string
}

interface TrainingDocAcknowledgement {
    _id?: import('mongodb').ObjectId
    docId: string
    userId: string
    userName: string
    version: number
    acknowledgedAt: Date
}
