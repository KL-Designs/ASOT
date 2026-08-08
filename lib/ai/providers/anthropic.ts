import Anthropic from '@anthropic-ai/sdk'
import { estimateTextCostUsd, DEFAULT_TEXT_MODEL_ANTHROPIC } from '@/lib/ai/costs'

let _client: Anthropic | null = null

function getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
    if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    return _client
}

export interface AnthropicTextRequest {
    model?: string
    systemPrompt?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
}

export interface AnthropicTextResponse {
    content: string
    inputTokens: number
    outputTokens: number
    actualCostUsd: number
    model: string
}

export async function callAnthropicText(req: AnthropicTextRequest): Promise<AnthropicTextResponse> {
    const client = getClient()
    const model = req.model ?? DEFAULT_TEXT_MODEL_ANTHROPIC

    const response = await client.messages.create({
        model,
        max_tokens: req.maxTokens ?? 2048,
        system: req.systemPrompt,
        messages: req.messages.map(m => ({ role: m.role, content: m.content })),
    })

    const content = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')

    const inputTokens  = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    const actualCostUsd = estimateTextCostUsd(model, inputTokens, outputTokens)

    return { content, inputTokens, outputTokens, actualCostUsd, model }
}

export function isAnthropicAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY
}

export function estimateAnthropicTextCost(
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
): number {
    return estimateTextCostUsd(model ?? DEFAULT_TEXT_MODEL_ANTHROPIC, estimatedInputTokens, estimatedOutputTokens)
}
