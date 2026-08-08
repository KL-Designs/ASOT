import type { ObjectId } from "mongodb"


export { }

declare global {

    interface Milpac {
        _id: string
        title: string
        section: string
    }

}