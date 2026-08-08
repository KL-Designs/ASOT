type SopCategory = 'General' | 'Operations' | 'Training' | 'Administration' | 'Communications'

interface SopDocument {
    _id?: import('mongodb').ObjectId
    title: string
    category: SopCategory
    description?: string
    createdAt: Date
    updatedAt: Date
    createdById: string
    createdByName: string
    updatedById?: string
    updatedByName?: string
    yjsState?: import('mongodb').Binary
}
