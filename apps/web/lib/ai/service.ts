/**
 * lib/ai/service.ts
 *
 * Provider-independent AI service layer.
 * All AI features call this module — never import provider SDKs directly in routes.
 *
 * Phase 1 exposes: callText, callImageGenerate, callImageEdit, checkBudgetOnly
 * Feature routes call checkBudgetOnly before rendering the confirmation prompt,
 * then call callText / callImageGenerate / callImageEdit on confirmed submit.
 */

import Db from '@/lib/mongo'
import { checkBudget, recordUsage } from '@/lib/ai/budget'
import {
    callAnthropicText,
    isAnthropicAvailable,
} from '@/lib/ai/providers/anthropic'
import {
    callOpenAiText,
    callOpenAiImageGenerate,
    callOpenAiImageEdit,
    isOpenAiAvailable,
} from '@/lib/ai/providers/openai'
import {
    estimateTextCostUsd,
    estimateImageCostUsd,
    DEFAULT_TEXT_MODEL_ANTHROPIC,
    DEFAULT_TEXT_MODEL_OPENAI,
    DEFAULT_IMAGE_MODEL_OPENAI,
    DEFAULT_IMAGE_QUALITY,
    DEFAULT_IMAGE_SIZE,
} from '@/lib/ai/costs'

export interface AiCallContext {
    userId: string
    userName: string
    departmentId?: string
    roles?: string[]
    feature: AiFeature
    relatedId?: string
}

export interface AiTextRequest {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    systemPrompt?: string
    maxTokens?: number
    provider?: AiProvider
    model?: string
}

export interface AiTextResponse {
    content: string
    inputTokens: number
    outputTokens: number
    actualCostUsd: number
    provider: AiProvider
    model: string
}

export interface AiImageRequest {
    prompt: string
    quality?: string
    size?: '1024x1024' | '1024x1792' | '1792x1024' | '1024x1536' | '1536x1024'
    referenceImageBase64?: string
}

export interface AiImageResponse {
    imageBase64: string
    revisedPrompt?: string
    actualCostUsd: number
    provider: AiProvider
    model: string
}

export interface AiEstimate {
    estimatedCostUsd: number
    provider: AiProvider
    model: string
    allowed: boolean
    reason?: string
}

async function getSiteConfig(): Promise<AiSiteConfig | null> {
    return Db.aiConfig.findOne({ _id: 'main' }) as Promise<AiSiteConfig | null>
}

function resolveTextProvider(config: AiSiteConfig | null, req: AiTextRequest): { provider: AiProvider; model: string } {
    if (req.provider && req.model) return { provider: req.provider, model: req.model }

    const provider: AiProvider = req.provider ?? (config?.providers.anthropic.enabled ? 'anthropic' : 'openai')
    const model = req.model ?? (
        provider === 'anthropic'
            ? (config?.providers.anthropic.defaultModel ?? DEFAULT_TEXT_MODEL_ANTHROPIC)
            : (config?.providers.openai.defaultModel ?? DEFAULT_TEXT_MODEL_OPENAI)
    )
    return { provider, model }
}

function resolveImageProvider(config: AiSiteConfig | null, req: AiImageRequest): { model: string; quality: string; size: string } {
    const model   = config?.providers.openai.defaultImageModel ?? DEFAULT_IMAGE_MODEL_OPENAI
    const quality = req.quality ?? DEFAULT_IMAGE_QUALITY
    const size    = req.size    ?? DEFAULT_IMAGE_SIZE
    return { model, quality, size }
}

export async function estimateTextCost(req: AiTextRequest, ctx: AiCallContext): Promise<AiEstimate> {
    const config = await getSiteConfig()
    const { provider, model } = resolveTextProvider(config, req)

    const estimatedInputTokens  = req.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
    const estimatedOutputTokens = req.maxTokens ?? 512
    const estimatedCostUsd      = estimateTextCostUsd(model, estimatedInputTokens, estimatedOutputTokens)

    const budgetResult = await checkBudget({ ...ctx, estimatedCostUsd })
    return {
        estimatedCostUsd,
        provider,
        model,
        allowed: budgetResult.allowed,
        reason:  budgetResult.reason,
    }
}

export async function estimateImageCost(req: AiImageRequest, ctx: AiCallContext): Promise<AiEstimate> {
    const config = await getSiteConfig()
    const { model, quality, size } = resolveImageProvider(config, req)
    const estimatedCostUsd = estimateImageCostUsd(model, quality, size)

    const budgetResult = await checkBudget({ ...ctx, estimatedCostUsd })
    return {
        estimatedCostUsd,
        provider: 'openai',
        model,
        allowed: budgetResult.allowed,
        reason:  budgetResult.reason,
    }
}

export async function callText(req: AiTextRequest, ctx: AiCallContext): Promise<AiTextResponse> {
    const config = await getSiteConfig()

    if (!config?.globalEnabled) throw new Error('AI features are currently disabled.')

    const { provider, model } = resolveTextProvider(config, req)

    // Budget check
    const estimatedInputTokens  = req.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
    const estimatedOutputTokens = req.maxTokens ?? 512
    const estimatedCostUsd      = estimateTextCostUsd(model, estimatedInputTokens, estimatedOutputTokens)
    const budgetResult          = await checkBudget({ ...ctx, estimatedCostUsd })

    if (!budgetResult.allowed) throw new Error(budgetResult.reason ?? 'Budget exceeded.')

    let result: AiTextResponse

    try {
        if (provider === 'anthropic') {
            if (!isAnthropicAvailable()) throw new Error('Anthropic API key not configured.')
            const res = await callAnthropicText({ model, systemPrompt: req.systemPrompt, messages: req.messages, maxTokens: req.maxTokens })
            result = { ...res, provider: 'anthropic' }
        } else {
            if (!isOpenAiAvailable()) throw new Error('OpenAI API key not configured.')
            const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []
            if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt })
            messages.push(...req.messages)
            const res = await callOpenAiText({ model, messages, maxTokens: req.maxTokens })
            result = { ...res, provider: 'openai' }
        }

        await recordUsage({
            userId: ctx.userId,
            userName: ctx.userName,
            departmentId: ctx.departmentId,
            roles: ctx.roles,
            feature: ctx.feature,
            provider: result.provider,
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostUsd,
            actualCostUsd: result.actualCostUsd,
            status: 'success',
            relatedId: ctx.relatedId,
            createdAt: new Date(),
        })

        return result
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        await recordUsage({
            userId: ctx.userId,
            userName: ctx.userName,
            departmentId: ctx.departmentId,
            roles: ctx.roles,
            feature: ctx.feature,
            provider,
            model,
            estimatedCostUsd,
            status: 'error',
            error,
            relatedId: ctx.relatedId,
            createdAt: new Date(),
        })
        throw err
    }
}

export async function callImageGenerate(req: AiImageRequest, ctx: AiCallContext): Promise<AiImageResponse> {
    const config = await getSiteConfig()
    if (!config?.globalEnabled) throw new Error('AI features are currently disabled.')
    if (!isOpenAiAvailable()) throw new Error('OpenAI API key not configured.')

    const { model, quality, size } = resolveImageProvider(config, req)
    const estimatedCostUsd = estimateImageCostUsd(model, quality, size)
    const budgetResult     = await checkBudget({ ...ctx, estimatedCostUsd })

    if (!budgetResult.allowed) throw new Error(budgetResult.reason ?? 'Budget exceeded.')

    try {
        const res = await callOpenAiImageGenerate({
            model,
            prompt: req.prompt,
            quality,
            size: req.size,
            referenceImageBase64: req.referenceImageBase64,
        })

        await recordUsage({
            userId: ctx.userId,
            userName: ctx.userName,
            departmentId: ctx.departmentId,
            roles: ctx.roles,
            feature: ctx.feature,
            provider: 'openai',
            model,
            imageCount: 1,
            imageSize: size,
            imageQuality: quality as AiImageQuality,
            estimatedCostUsd,
            actualCostUsd: res.actualCostUsd,
            status: 'success',
            relatedId: ctx.relatedId,
            createdAt: new Date(),
        })

        return { ...res, provider: 'openai' }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        await recordUsage({
            userId: ctx.userId,
            userName: ctx.userName,
            departmentId: ctx.departmentId,
            roles: ctx.roles,
            feature: ctx.feature,
            provider: 'openai',
            model,
            imageCount: 1,
            imageSize: size,
            imageQuality: quality as AiImageQuality,
            estimatedCostUsd,
            status: 'error',
            error,
            relatedId: ctx.relatedId,
            createdAt: new Date(),
        })
        throw err
    }
}

export async function callImageEdit(req: AiImageRequest & { imageBase64: string }, ctx: AiCallContext): Promise<AiImageResponse> {
    const config = await getSiteConfig()
    if (!config?.globalEnabled) throw new Error('AI features are currently disabled.')
    if (!isOpenAiAvailable()) throw new Error('OpenAI API key not configured.')

    const { model, quality, size } = resolveImageProvider(config, req)
    const estimatedCostUsd = estimateImageCostUsd(model, quality, size)
    const budgetResult     = await checkBudget({ ...ctx, estimatedCostUsd })

    if (!budgetResult.allowed) throw new Error(budgetResult.reason ?? 'Budget exceeded.')

    try {
        const res = await callOpenAiImageEdit({ model, prompt: req.prompt, quality, size: req.size, imageBase64: req.imageBase64 })

        await recordUsage({
            userId: ctx.userId,
            userName: ctx.userName,
            departmentId: ctx.departmentId,
            roles: ctx.roles,
            feature: ctx.feature,
            provider: 'openai',
            model,
            imageCount: 1,
            imageSize: size,
            imageQuality: quality as AiImageQuality,
            estimatedCostUsd,
            actualCostUsd: res.actualCostUsd,
            status: 'success',
            relatedId: ctx.relatedId,
            createdAt: new Date(),
        })

        return { ...res, provider: 'openai' }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        await recordUsage({
            userId: ctx.userId,
            userName: ctx.userName,
            departmentId: ctx.departmentId,
            roles: ctx.roles,
            feature: ctx.feature,
            provider: 'openai',
            model,
            imageCount: 1,
            imageSize: size,
            imageQuality: quality as AiImageQuality,
            estimatedCostUsd,
            status: 'error',
            error,
            relatedId: ctx.relatedId,
            createdAt: new Date(),
        })
        throw err
    }
}

export { isAnthropicAvailable, isOpenAiAvailable }
