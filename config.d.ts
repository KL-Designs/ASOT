export { }

declare global {

    interface Config {
        discord: {
            token: string
            guild: string
        }

        api: string

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