interface TrainingDocItem {
    _id?: import('mongodb').ObjectId
    type: 'folder' | 'document'
    name: string
    parentId: import('mongodb').ObjectId | null
    // document-only
    htmlContent?: string
    imageFiles?: string[]        // stored filenames in uploads/training-docs/
    originalFileName?: string    // set for Google Docs zip uploads; absent for new blank docs
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
