/**
 * Render routes. Each parses its body with zod, draws, and returns bytes.
 *
 * Nothing here writes to disk. The originals interpolated a client-controlled
 * name into an output path at three separate sites, which combined with the
 * missing auth was an unauthenticated arbitrary file write — PLAN.md section 9
 * findings 2 and 3. Responses are buffers; apps/web decides where they land,
 * using the member's Discord ID rather than anything a caller supplied.
 */

import { Router } from 'express'
import type { ZodType, ZodTypeDef } from 'zod'
import { boxSchema, certificateSchema, uniformSchema } from '../schema'
import { renderUniform } from '../render/uniform'
import { renderBox } from '../render/box'
import { renderCertificate } from '../render/certificate'
import { MissingAssetError } from '../render/layers'
import { fail } from '../errors'

export const renderRouter = Router()

/**
 * Shared shape for a render endpoint: validate, draw, send PNG. Keeps the
 * error contract identical across routes rather than repeated per handler.
 */
// The input type is left open because schemas using .default() parse a wider
// input than they produce — the certificate schema's optional fields are
// required on the way out.
function renderRoute<Out>(
    schema: ZodType<Out, ZodTypeDef, unknown>,
    render: (payload: Out) => Promise<Buffer>,
) {
    return async (req: import('express').Request, res: import('express').Response) => {
        const parsed = schema.safeParse(req.body)
        if (!parsed.success) {
            const issue = parsed.error.issues[0]
            res.status(400).json({
                error: 'Invalid request body',
                field: issue?.path.join('.') || '(root)',
            })
            return
        }

        try {
            const png = await render(parsed.data)
            res.type('image/png').send(png)
        } catch (err) {
            if (err instanceof MissingAssetError) {
                res.status(422).json({ error: 'Unknown asset', asset: err.asset })
                return
            }
            fail(res, err, 'render failed')
        }
    }
}

renderRouter.post('/uniform', renderRoute(uniformSchema, renderUniform))
renderRouter.post('/box', renderRoute(boxSchema, renderBox))
renderRouter.post('/certificate', renderRoute(certificateSchema, renderCertificate))
