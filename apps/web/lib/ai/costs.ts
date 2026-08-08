export interface ModelTextPricing {
    inputPer1kUsd: number
    outputPer1kUsd: number
}

export interface ModelImagePricing {
    [qualityAndSize: string]: number
}

export const TEXT_PRICING: Record<string, ModelTextPricing> = {
    // Anthropic Claude
    'claude-sonnet-4-6':             { inputPer1kUsd: 0.003,    outputPer1kUsd: 0.015 },
    'claude-opus-4-7':               { inputPer1kUsd: 0.015,    outputPer1kUsd: 0.075 },
    'claude-haiku-4-5-20251001':     { inputPer1kUsd: 0.00025,  outputPer1kUsd: 0.00125 },
    // OpenAI text
    'gpt-4o':                        { inputPer1kUsd: 0.005,    outputPer1kUsd: 0.015 },
    'gpt-4o-mini':                   { inputPer1kUsd: 0.00015,  outputPer1kUsd: 0.0006 },
}

export const IMAGE_PRICING: Record<string, ModelImagePricing> = {
    'dall-e-3': {
        'standard-1024x1024': 0.040,
        'standard-1024x1792': 0.080,
        'standard-1792x1024': 0.080,
        'hd-1024x1024':       0.080,
        'hd-1024x1792':       0.120,
        'hd-1792x1024':       0.120,
    },
    'gpt-image-1': {
        'low-1024x1024':      0.011,
        'medium-1024x1024':   0.042,
        'high-1024x1024':     0.167,
        'low-1024x1536':      0.016,
        'medium-1024x1536':   0.063,
        'high-1024x1536':     0.250,
        'low-1536x1024':      0.016,
        'medium-1536x1024':   0.063,
        'high-1536x1024':     0.250,
    },
}

export function estimateTextCostUsd(
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
): number {
    const pricing = TEXT_PRICING[model]
    if (!pricing) return 0
    return (
        (estimatedInputTokens  / 1000) * pricing.inputPer1kUsd +
        (estimatedOutputTokens / 1000) * pricing.outputPer1kUsd
    )
}

export function estimateImageCostUsd(
    model: string,
    quality: string,
    size: string
): number {
    const modelPricing = IMAGE_PRICING[model]
    if (!modelPricing) return 0
    const key = `${quality}-${size}`
    if (modelPricing[key] !== undefined) return modelPricing[key]
    // Fall back to the first matching quality prefix
    const fallbackKey = Object.keys(modelPricing).find(k => k.startsWith(quality))
    return fallbackKey ? modelPricing[fallbackKey] : 0
}

export const DEFAULT_TEXT_MODEL_ANTHROPIC = 'claude-sonnet-4-6'
export const DEFAULT_TEXT_MODEL_OPENAI    = 'gpt-4o-mini'
export const DEFAULT_IMAGE_MODEL_OPENAI   = 'gpt-image-1'
export const DEFAULT_IMAGE_QUALITY        = 'medium'
export const DEFAULT_IMAGE_SIZE           = '1024x1024'
