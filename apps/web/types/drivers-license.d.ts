interface DriverLicenseEntry {
    _id: import('mongodb').ObjectId
    name: string
    section: string
    status: 'Active' | 'Under Review' | 'Revoked'
    updatedAt: Date
    updatedBy?: string
}
