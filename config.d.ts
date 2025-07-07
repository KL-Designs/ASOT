export { }

declare global {

    interface Config {
        discord: {
            token: string
            guild: string
        }

        mongo: {
            uri: string
            db: string
        }
    }


    interface Modlist {
        id: string
        name: string
        description: string
        mods: {
            id: string
            name: string
        }[],
        useOptionals: boolean
        xml: any
    }

}