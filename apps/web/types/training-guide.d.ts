type TrainingGuideStatus = 'draft' | 'approved' | 'archived'

interface TrainingGuideEquipmentItem {
    id: string
    text: string
}

interface TrainingGuideImageBorder {
    enabled: boolean
    color: string
    thickness: number
}

interface TrainingGuideImage {
    id: string
    url: string
    caption?: string
    width?: number
    border?: TrainingGuideImageBorder
    /** Where the image appears — left/right float, full-width block, or freely placed */
    position?: 'left' | 'right' | 'full' | 'free'
    /** Pixel offsets from the teaching-point body top-left — only used when position === 'free' */
    x?: number
    y?: number
}

interface TrainingGuideDotPoint {
    id: string
    text: string
    indent?: number  // 0 = top-level, 1 = one indent in (from nested list)
}

interface RevisionQuestion {
    id: string
    text: string
    indent?: number
}

interface RevisionTopic {
    id: string
    title: string
    questions: RevisionQuestion[]
}

interface TrainingGuideVitalPoint {
    id: string
    text: string
    indent?: number
}

interface TrainingGuideCommonFault {
    id: string
    fault: string
    correction: string
}

interface TrainingGuideTeachingPoint {
    id: string
    title: string
    dotPoints: TrainingGuideDotPoint[]
    /** Legacy single-image field — kept for migration; use images[] instead */
    image?: TrainingGuideImage | null
    images: TrainingGuideImage[]
    vitalPoints: TrainingGuideVitalPoint[]
    commonFaults: TrainingGuideCommonFault[]
}

/** One entry in the per-document edit history (every autosave + every approval) */
interface TrainingGuideEditEntry {
    at: Date
    byId: string
    byName: string
    /** 'edit' = autosave, 'approved' = version published, 'created' = initial */
    type: 'edit' | 'approved' | 'created'
    /** Set only on 'approved' entries */
    version?: string
    changeType?: 'minor' | 'major'
    /** Human-readable list of what changed in this edit */
    changes?: string[]
    /** JSON snapshot of the document content AFTER this edit — used to compute visual diffs */
    snapshot?: string
}

interface TrainingGuide {
    _id?: import('mongodb').ObjectId
    docRef: string
    title: string
    /** Hex accent colour for the document header fills (default #db001d) */
    accentColor: string
    /** Hex colour for section borders and structural labels (defaults to accentColor) */
    outlineColor?: string
    /** Hex accent colour for the Revision section (default #d97706) */
    revisionColor?: string
    status: TrainingGuideStatus
    /** Semantic version — only bumped on approval, not on autosave */
    version: string
    lastRevisedAt: Date
    duration: string
    overview: string
    equipment: TrainingGuideEquipmentItem[]
    trainingAreaDescription: string
    teachingPoints: TrainingGuideTeachingPoint[]
    revisionTopics?: RevisionTopic[]
    notes: string

    /** Optional link to the training type this guide belongs to */
    trainingTypeId?: string

    /** Distinguishes document purpose — both use the same editor for now */
    guideType?: 'trainers_guide' | 'training_document'

    createdAt: Date
    createdById: string
    createdByName: string
    updatedAt: Date
    updatedById: string
    updatedByName: string

    /** Full edit history — autosaves + approvals */
    editHistory: TrainingGuideEditEntry[]
    /** JSON snapshot taken at last approval — used to diff on next approval */
    contentBaseline: string

    deletedAt?: Date
    deletedById?: string
    deletedByName?: string

    approvedAt?: Date
    approvedById?: string
    approvedByName?: string
}
