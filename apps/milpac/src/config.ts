/**
 * Environment parsing. Fails fast at import time so a misconfigured container
 * dies at boot with a named variable rather than 500ing on the first request.
 *
 * Deliberately short: this service holds no database connection, no Discord
 * credential and no third-party API key. If this list grows past a handful of
 * entries, something has been added that probably belongs in apps/web instead.
 */

function required(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(
            `[milpac] Missing required environment variable ${name}. ` +
            `See .env.template at the repo root.`
        )
    }
    return value
}

export const config = {
    port: Number(process.env.PORT) || 42070,

    /**
     * Shared secret for the Bearer token every route except /health requires.
     * Web sends it as `Authorization: Bearer ${MILPAC_SERVICE_TOKEN}`.
     */
    serviceToken: required('MILPAC_SERVICE_TOKEN'),

    /**
     * When true the boot-time asset preflight logs its findings and continues
     * instead of exiting. Intended for local asset work, never for the
     * container — a service that starts with missing art renders silently
     * wrong uniforms, which is the failure mode the preflight exists to stop.
     */
    allowMissingAssets: process.env.MILPAC_ALLOW_MISSING_ASSETS === 'true',
} as const
