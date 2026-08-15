/**
 * Express bootstrap.
 *
 * A stateless renderer: no database connection, no session, no credentials
 * beyond the shared bearer token, and no filesystem writes. It receives a
 * payload built from apps/web's authoritative member data, draws pixels, and
 * returns bytes.
 *
 * See PLAN.md section 4 for why the data model deliberately stays in apps/web,
 * and section 9 for the findings in the original this shape removes.
 */

import express from 'express'
import { config } from './config'
import { preflight } from './assets'
import { requireBearer } from './middleware/auth'
import { renderRouter } from './routes/render'

const app = express()

// No cors(). The service is called server-to-server from apps/web over the
// internal Docker network and publishes no port; no browser origin needs it.

app.use(express.json({ limit: '256kb' }))

/**
 * The only unauthenticated route, so compose's healthcheck can reach it.
 * Reports liveness only — it deliberately exposes no version, asset counts or
 * configuration that would be useful to someone who should not be here.
 */
app.get('/health', (_req, res) => {
    res.json({ ok: true })
})

app.use(requireBearer)
app.use('/render', renderRouter)

app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
})

/**
 * Assets are validated before the port opens. A missing or ambiguous asset is a
 * startup failure naming every problem at once, not a runtime exception on the
 * one request that happens to need it — and certainly not a silent warning and
 * a uniform that renders wrong without telling anyone.
 */
function start() {
    const { errors, warnings } = preflight()

    for (const warning of warnings) console.warn(`[milpac] preflight warning: ${warning}`)

    if (errors.length > 0) {
        console.error(`[milpac] asset preflight failed with ${errors.length} error(s):`)
        for (const error of errors) console.error(`  - ${error}`)

        if (!config.allowMissingAssets) {
            console.error('[milpac] refusing to start. Set MILPAC_ALLOW_MISSING_ASSETS=true to override locally.')
            process.exit(1)
        }
        console.warn('[milpac] MILPAC_ALLOW_MISSING_ASSETS is set — starting anyway. Renders may be wrong.')
    }

    app.listen(config.port, () => {
        console.log(`[milpac] renderer listening on :${config.port}`)
    })
}

start()
