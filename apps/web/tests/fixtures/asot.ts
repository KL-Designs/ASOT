/**
 * Auth fixtures.
 *
 * Signing in is just "put a token cookie on the context" — `fetchMe()` reads
 * `token` from the cookie jar and resolves the user straight out of Mongo
 * (`lib/discord/index.ts:39`). No OAuth round-trip is involved, so there is
 * nothing to stub and nothing to wait for.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { BASE_URL, USERS, type PersonaKey } from '../constants'

/** Attach a persona's session cookie to an existing context. */
export async function signIn(context: BrowserContext, persona: PersonaKey): Promise<void> {
    await context.addCookies([
        {
            name: 'token',
            value: USERS[persona].token,
            url: BASE_URL,
            httpOnly: true,
            sameSite: 'Lax',
        },
    ])
}

export async function signOut(context: BrowserContext): Promise<void> {
    await context.clearCookies()
}

type Fixtures = {
    /** Page already authenticated as the OVERRIDE user — full access to
     *  everything, since OVERRIDE short-circuits both permission systems. */
    adminPage: Page
    /** Page authenticated as an ordinary J3 department member. */
    memberPage: Page
    /** Opens a page for any persona. */
    pageAs: (persona: PersonaKey) => Promise<Page>
}

export const test = base.extend<Fixtures>({
    adminPage: async ({ context }, use) => {
        await signIn(context, 'override')
        await use(await context.newPage())
    },

    memberPage: async ({ context }, use) => {
        await signIn(context, 'j3')
        await use(await context.newPage())
    },

    pageAs: async ({ browser }, use) => {
        const contexts: BrowserContext[] = []
        await use(async (persona: PersonaKey) => {
            const context = await browser.newContext()
            contexts.push(context)
            await signIn(context, persona)
            return context.newPage()
        })
        await Promise.all(contexts.map(c => c.close()))
    },
})

export { expect }
