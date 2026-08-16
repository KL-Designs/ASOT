/**
 * Bearer token check, applied to every route as shared middleware rather than
 * per route. PLAN.md section 9 rule 1: no route opts out except /health.
 *
 * The original gated /register on `req.headers.host` — a client-controlled
 * value — and left every generation endpoint with no check at all. Identity is
 * never read from any header but Authorization here.
 */

import type { NextFunction, Request, Response } from 'express'
import { timingSafeEqual } from 'crypto'
import { config } from '../config'

const expected = Buffer.from(config.serviceToken)

/** Constant-time compare, so a wrong token leaks nothing through response timing. */
function tokenMatches(provided: string): boolean {
    const given = Buffer.from(provided)
    if (given.length !== expected.length) return false
    return timingSafeEqual(given, expected)
}

export function requireBearer(req: Request, res: Response, next: NextFunction) {
    const header = req.get('authorization')
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' })
        return
    }
    if (!tokenMatches(header.slice('Bearer '.length))) {
        res.status(401).json({ error: 'Unauthorized' })
        return
    }
    next()
}
