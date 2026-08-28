/**
 * Whether the site's development-only tools are on screen and answering.
 *
 * ## Why this is not just `NODE_ENV`
 *
 * `NODE_ENV` cannot answer this for a build you intend to *run*, for two
 * separate reasons:
 *
 * 1. Next inlines `process.env.NODE_ENV` into the client bundle at build time,
 *    and `next build` fixes it at `"production"`. So `NODE_ENV !== 'production'`
 *    in a client component is compiled to `false` and the control is removed
 *    from the bundle entirely. No runtime variable brings it back.
 * 2. `server.mjs` derives its own `dev` flag from `NODE_ENV` too, so starting
 *    the built server with `NODE_ENV=development` does not serve the build at
 *    all — it starts the dev compiler, which is `npm run dev-collab`.
 *
 * Hence a second, explicit switch. `NEXT_PUBLIC_DEV_TOOLS=true` gives a real
 * production build that still carries the workbench: a staging box, or a
 * local check of the built site with the generators still reachable.
 *
 * ## Set it before you build
 *
 * The `NEXT_PUBLIC_` prefix is what lets the client see it, and that value is
 * baked in at build time. Setting it only at start would light up the API
 * routes while leaving no buttons to call them. Both `npm run build` and
 * `npm start` load the same root `.env`, so putting it there keeps the two in
 * step; `npm run build:devtools` / `npm run start:devtools` pass it explicitly.
 *
 * ## Opt-in, on purpose
 *
 * A deployment that has not set this is exactly as locked down as it was when
 * the gate was `NODE_ENV` alone. The API routes read this same constant, so
 * "visible but refusing" and "hidden but answering" are both states that cannot
 * happen. It is still only half a gate: every dev route checks a permission
 * after this, because a staging box is not an unlocked one.
 */
export const DEV_TOOLS_ENABLED =
    process.env.NODE_ENV !== 'production'
    || process.env.NEXT_PUBLIC_DEV_TOOLS === 'true'
