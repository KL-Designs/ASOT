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

}