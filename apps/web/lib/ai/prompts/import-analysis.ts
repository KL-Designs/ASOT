/**
 * lib/ai/prompts/import-analysis.ts
 *
 * AI-assisted analysis of imported operations order documents.
 * Falls back to heuristic-only analysis if AI is not configured.
 */

import { callText, type AiCallContext } from '@/lib/ai/service'
import type { IntermediateDoc, IntermediateElement } from '@/lib/operations/import/parse-docx'

export interface AiAnalysisResult {
    detectedTitle: string
    detectedDate?: string
    smeacSections: Array<{
        label: 'situation' | 'mission' | 'execution' | 'admin_log' | 'command_sig' | 'other'
        detectedTitle: string
        startIndex: number
        endIndex: number
        confidence: number
    }>
    imageCaptions: Array<{
        tempId: string
        caption: string
        confidence: number
    }>
    campaignHint?: string
    warnings: string[]
}

const SYSTEM_PROMPT = `You are analysing a military operations order document from an ARMA 3 milsim unit.

Your task:
1. Identify the operation title and date if present
2. Identify SMEAC sections (Situation, Mission, Execution, Administration & Logistics, Command & Signals)
   - These sections may have slightly different names in historical documents (e.g. "Admin & Log", "Comms & Sig", "Command & Sig", "Execution Plan", etc.)
   - Use your judgment to map them to the correct SMEAC label
3. Identify image captions — text immediately before or after an image_ref element that describes it
4. Identify any campaign or operation name hints in the document text
5. Note any anomalies or missing sections

Return ONLY a JSON object matching this exact structure — no commentary, no markdown, no extra text:
{
  "detectedTitle": "string",
  "detectedDate": "string or null",
  "smeacSections": [
    {
      "label": "situation|mission|execution|admin_log|command_sig|other",
      "detectedTitle": "string",
      "startIndex": number,
      "endIndex": number,
      "confidence": number (0-1)
    }
  ],
  "imageCaptions": [
    {
      "tempId": "string",
      "caption": "string",
      "confidence": number (0-1)
    }
  ],
  "campaignHint": "string or null",
  "warnings": ["string"]
}

Rules:
- Do NOT invent information — only return what is present in the document
- Do NOT rewrite operational content
- If a section is ambiguous, set confidence below 0.7 and add a warning
- startIndex and endIndex refer to the element array indices provided
- image_ref elements have tempId values like "img_0", "img_1" etc.`

function buildUserMessage(doc: IntermediateDoc): string {
    const lines: string[] = [
        `Document title (from filename/H1): ${doc.title}`,
        `Total elements: ${doc.elements.length}`,
        '',
        'Elements (index: type: content):',
    ]

    for (let i = 0; i < doc.elements.length; i++) {
        const el = doc.elements[i]
        switch (el.type) {
            case 'heading':
                lines.push(`${i}: heading-H${el.level}: ${el.text}`)
                break
            case 'paragraph':
                lines.push(`${i}: paragraph: ${el.text.slice(0, 200)}${el.text.length > 200 ? '...' : ''}`)
                break
            case 'list':
                lines.push(`${i}: list(${el.ordered ? 'ordered' : 'unordered'}): ${el.items.slice(0, 5).join(' | ')}${el.items.length > 5 ? ` ... (+${el.items.length - 5} more)` : ''}`)
                break
            case 'table':
                lines.push(`${i}: table: ${el.rows.length} rows x ${el.rows[0]?.length ?? 0} cols`)
                break
            case 'image_ref':
                lines.push(`${i}: image_ref: tempId=${el.tempId}`)
                break
            case 'hr':
                lines.push(`${i}: hr`)
                break
        }
    }

    if (doc.extractedImages.length > 0) {
        lines.push('', 'Extracted images:')
        for (const img of doc.extractedImages) {
            lines.push(`  ${img.tempId}: positionIndex=${img.positionIndex}${img.captionText ? ` captionHint="${img.captionText.slice(0, 100)}"` : ''}`)
        }
    }

    return lines.join('\n')
}

function heuristicAnalysis(doc: IntermediateDoc): AiAnalysisResult {
    const SMEAC_MAP: Array<[RegExp, AiAnalysisResult['smeacSections'][number]['label']]> = [
        [/situation/i, 'situation'],
        [/mission/i, 'mission'],
        [/execution/i, 'execution'],
        [/admin|logistics/i, 'admin_log'],
        [/command|signals?|comms/i, 'command_sig'],
    ]

    const smeacSections: AiAnalysisResult['smeacSections'] = []

    for (let i = 0; i < doc.elements.length; i++) {
        const el = doc.elements[i]
        if (el.type !== 'heading') continue

        for (const [pattern, label] of SMEAC_MAP) {
            if (pattern.test(el.text)) {
                // Find end: next SMEAC heading or end of doc
                let endIndex = doc.elements.length - 1
                for (let j = i + 1; j < doc.elements.length; j++) {
                    const next = doc.elements[j]
                    if (next.type === 'heading' && SMEAC_MAP.some(([p]) => p.test(next.text))) {
                        endIndex = j - 1
                        break
                    }
                }
                smeacSections.push({
                    label,
                    detectedTitle: el.text,
                    startIndex: i,
                    endIndex,
                    confidence: 0.75,
                })
                break
            }
        }
    }

    const imageCaptions: AiAnalysisResult['imageCaptions'] = []
    for (const img of doc.extractedImages) {
        if (img.captionText) {
            imageCaptions.push({ tempId: img.tempId, caption: img.captionText, confidence: 0.6 })
        }
    }

    return {
        detectedTitle: doc.title,
        detectedDate: undefined,
        smeacSections,
        imageCaptions,
        campaignHint: undefined,
        warnings: ['AI analysis not available — heuristic section detection used'],
    }
}

export async function analyseImportedDocument(
    doc: IntermediateDoc,
    ctx: AiCallContext
): Promise<AiAnalysisResult> {
    const userMessage = buildUserMessage(doc)

    try {
        const response = await callText(
            {
                messages: [{ role: 'user', content: userMessage }],
                systemPrompt: SYSTEM_PROMPT,
                maxTokens: 2000,
            },
            ctx
        )

        const raw = response.content.trim()
        // Strip markdown code fences if present
        const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

        try {
            const parsed = JSON.parse(jsonStr) as AiAnalysisResult
            return parsed
        } catch (parseErr) {
            throw new Error(`AI returned non-JSON response: ${raw.slice(0, 500)}`)
        }
    } catch (err) {
        // AI not configured, budget exceeded, or other error — fall back to heuristics
        const isConfigError =
            err instanceof Error &&
            (err.message.includes('disabled') ||
                err.message.includes('not configured') ||
                err.message.includes('Budget exceeded'))

        if (isConfigError) {
            return heuristicAnalysis(doc)
        }

        // Unexpected error — return heuristic result with the error as a warning
        const result = heuristicAnalysis(doc)
        result.warnings.push(`AI analysis failed: ${err instanceof Error ? err.message : String(err)}`)
        return result
    }
}
