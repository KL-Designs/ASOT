export { }

declare global {

    interface Config {
        discord: {
            token: string
            guild: string
            memberRole: string
            adminRole: string
            notificationChannel: string
            songSubmissionChannel: string
        }

        /** Public site URL. Use this for anything a member will click. */
        api: string

        /**
         * Where to reach apps/web for server-to-server calls. Defaults to `api`
         * and is overridden to the compose service name in Docker, so an
         * internal call does not leave the network and come back through the
         * reverse proxy. Never put this in a link — it is unreachable to members.
         */
        apiInternal: string

        /**
         * Shared secret for the handful of apps/web routes the bot calls
         * server-to-server. Empty when unset, which those callers treat as
         * "feature not configured" rather than failing at startup — the bot has
         * plenty to do without it.
         */
        apiSecret: string

        mongo: {
            uri: string
            db: string
        }
    }


    interface Modlist {
        id: string
        name: string
        description: string
        banner?: string
        color: string
        mods: {
            id: string
            name: string
        }[],
        useOptionals: boolean
        xml: any
    }

}