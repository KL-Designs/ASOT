import OpenAI from 'openai'
import {
    estimateTextCostUsd,
    estimateImageCostUsd,
    DEFAULT_TEXT_MODEL_OPENAI,
    DEFAULT_IMAGE_MODEL_OPENAI,
    DEFAULT_IMAGE_QUALITY,
    DEFAULT_IMAGE_SIZE,
} from '@/lib/ai/costs'

let _client: OpenAI | null = null

function getClient(): OpenAI {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return _client
}

export interface OpenAiTextRequest {
    model?: string
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    maxTokens?: number
}

export interface OpenAiTextResponse {
    content: string
    inputTokens: number
    outputTokens: number
    actualCostUsd: number
    model: string
}

export interface OpenAiImageRequest {
    model?: string
    prompt: string
    quality?: string
    size?: '1024x1024' | '1024x1792' | '1792x1024' | '1024x1536' | '1536x1024'
    referenceImageBase64?: string
}

export interface OpenAiImageResponse {
    imageBase64: string
    revisedPrompt?: string
    actualCostUsd: number
    model: string
}

export async function callOpenAiText(req: OpenAiTextRequest): Promise<OpenAiTextResponse> {
    const client = getClient()
    const model = req.model ?? DEFAULT_TEXT_MODEL_OPENAI

    const response = await client.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? 2048,
        messages: req.messages,
    })

    const content = response.choices[0]?.message?.content ?? ''
    const inputTokens  = response.usage?.prompt_tokens ?? 0
    const outputTokens = response.usage?.completion_tokens ?? 0
    const actualCostUsd = estimateTextCostUsd(model, inputTokens, outputTokens)

    return { content, inputTokens, outputTokens, actualCostUsd, model }
}

export async function callOpenAiImageGenerate(req: OpenAiImageRequest): Promise<OpenAiImageResponse> {
    const client = getClient()
    const model   = req.model   ?? DEFAULT_IMAGE_MODEL_OPENAI
    const quality = req.quality ?? DEFAULT_IMAGE_QUALITY
    const size    = req.size    ?? (DEFAULT_IMAGE_SIZE as OpenAiImageRequest['size'])

    // gpt-image-1 does not accept response_format; dall-e-3 needs 'b64_json'
    const response = await client.images.generate({
        model,
        prompt: req.prompt,
        quality: quality as Parameters<typeof client.images.generate>[0]['quality'],
        size:    size    as Parameters<typeof client.images.generate>[0]['size'],
        ...(model !== 'gpt-image-1' && { response_format: 'b64_json' }),
        n: 1,
    })

    const imageBase64    = response.data?.[0]?.b64_json ?? ''
    const revisedPrompt  = response.data?.[0]?.revised_prompt
    const actualCostUsd  = estimateImageCostUsd(model, quality, size ?? DEFAULT_IMAGE_SIZE)

    return { imageBase64, revisedPrompt, actualCostUsd, model }
}

export async function callOpenAiImageEdit(req: OpenAiImageRequest & { imageBase64: string }): Promise<OpenAiImageResponse> {
    const client = getClient()
    const model   = req.model   ?? DEFAULT_IMAGE_MODEL_OPENAI
    const quality = req.quality ?? DEFAULT_IMAGE_QUALITY
    const size    = req.size    ?? (DEFAULT_IMAGE_SIZE as OpenAiImageRequest['size'])

    const imageBuffer = Buffer.from(req.imageBase64, 'base64')
    const imageFile   = new File([imageBuffer], 'image.png', { type: 'image/png' })

    const response = await client.images.edit({
        model,
        image: imageFile,
        prompt: req.prompt,
        size: size as Parameters<typeof client.images.edit>[0]['size'],
        ...(model !== 'gpt-image-1' && { response_format: 'b64_json' }),
        n: 1,
    })

    const imageBase64   = response.data?.[0]?.b64_json ?? ''
    const actualCostUsd = estimateImageCostUsd(model, quality, size ?? DEFAULT_IMAGE_SIZE)

    return { imageBase64, actualCostUsd, model }
}

export function isOpenAiAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY
}

export function estimateOpenAiTextCost(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number {
    return estimateTextCostUsd(model ?? DEFAULT_TEXT_MODEL_OPENAI, estimatedInputTokens, estimatedOutputTokens)
}

export function estimateOpenAiImageCost(model: string, quality: string, size: string): number {
    return estimateImageCostUsd(model ?? DEFAULT_IMAGE_MODEL_OPENAI, quality, size)
}
