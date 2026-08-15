/**
 * Failure responses.
 *
 * PLAN.md section 9 rule 4: no error object is ever serialised into a response.
 * The original returned `JSON.stringify(err, Object.getOwnPropertyNames(err))`,
 * handing the caller stack traces and absolute filesystem paths. Here the
 * caller gets a generic message and a correlation id; the detail goes to the
 * server log under the same id.
 */

import { randomUUID } from 'crypto'
import type { Response } from 'express'

export function fail(res: Response, err: unknown, context: string, status = 500) {
    const correlationId = randomUUID()
    console.error(`[milpac] ${context} (${correlationId})`, err)
    res.status(status).json({
        error: 'Internal error',
        correlationId,
    })
}
