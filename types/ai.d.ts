type AiProvider = 'anthropic' | 'openai'

type AiFeature =
    | 'intel.image_generate'
    | 'intel.image_edit'
    | 'training.answer_review'
    | 'text.general'

type AiImageQuality = 'standard' | 'hd'

type AiBudgetScopeType = 'site' | 'department' | 'role' | 'member' | 'feature'

interface AiUsageRecord {
    _id?: import('mongodb').ObjectId
    userId: string
    userName: string
    departmentId?: string
    roles?: string[]
    feature: AiFeature
    provider: AiProvider
    model: string
    inputTokens?: number
    outputTokens?: number
    imageCount?: number
    imageSize?: string
    imageQuality?: AiImageQuality
    estimatedCostUsd: number
    actualCostUsd?: number
    status: 'success' | 'error' | 'cancelled'
    error?: string
    relatedId?: string
    createdAt: Date
}

interface AiBudgetConfig {
    _id?: import('mongodb').ObjectId
    scopeType: AiBudgetScopeType
    scopeKey: string
    scopeLabel: string
    monthlyLimitUsd?: number
    textTokenMonthlyLimit?: number
    imageMonthlyLimit?: number
    allowedModels?: string[]
    allowedImageQualities?: AiImageQuality[]
    warningThresholds: number[]
    hardStop: boolean
    enabled: boolean
    createdAt: Date
    updatedAt: Date
    updatedById: string
    updatedByName: string
}

interface AiSiteConfig {
    _id: 'main'
    globalEnabled: boolean
    providers: {
        anthropic: { enabled: boolean; defaultModel: string }
        openai: { enabled: boolean; defaultModel: string; defaultImageModel: string }
    }
    featureDefaults: Partial<Record<AiFeature, { provider: AiProvider; model: string; imageQuality?: AiImageQuality }>>
    updatedAt: Date
    updatedById: string
    updatedByName: string
}

interface AiCreditSummary {
    monthlyLimitUsd: number | null
    usedUsd: number
    remainingUsd: number | null
    imageMonthlyLimit: number | null
    imagesUsedThisMonth: number
    textTokenMonthlyLimit: number | null
    textTokensUsedThisMonth: number
    warningLevel: 'ok' | 'warning' | 'critical' | 'exceeded'
    warningThresholdReached: number | null
}

type AiCameraStyle =
    | 'dslr'
    | 'helmet_cam'
    | 'bodycam'
    | 'drone_uav'
    | 'cctv'
    | 'long_range'
    | 'satellite_isr'
    | 'thermal'
    | 'night_vision'

type AiPoseOption = 'keep' | 'ai' | 'custom'

type AiFramingDistance = 'close' | 'medium' | 'wide' | 'establishing'

interface AiGeneratedImage {
    _id?: import('mongodb').ObjectId
    userId: string
    userName: string
    departmentId?: string
    feature: AiFeature
    provider: AiProvider
    model: string
    // Generation parameters
    prompt: string
    sceneDescription: string
    cameraStyle: AiCameraStyle
    environment?: string
    timeOfDay?: string
    weather?: string
    mood?: string
    pose: AiPoseOption
    poseDescription?: string
    framingDistance?: AiFramingDistance
    extraInstructions?: string
    quality: string
    hadSourceImage: boolean
    // Storage
    imagePath: string          // composited image (clean AI output + PNG overlay)
    cleanImagePath?: string    // clean AI output before overlay compositing
    sourceImagePath?: string   // user-uploaded ARMA source screenshot
    overlayStyle: AiCameraStyle
    aspectRatio: 'portrait' | 'landscape' | 'square'
    // Cost
    generationCostUsd: number
    // Links
    linkedOperationId?: string
    linkedIntelPackageId?: string
    // Status
    status: 'generated' | 'used' | 'deleted'
    createdAt: Date
    usedAt?: Date
    deletedAt?: Date
}

interface AiUsageAggregates {
    totalCostUsd: number
    totalImages: number
    totalInputTokens: number
    totalOutputTokens: number
    requestCount: number
    errorCount: number
}
