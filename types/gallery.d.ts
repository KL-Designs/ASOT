import type { ObjectId } from "mongodb"


export { }

declare global {

    interface ScreenshotOfMonth {
        filename: string
        dateTaken: string
        credit: string
        setAt: string
        setBy: string
    }

    interface GalleryAPI {
        info: string
        updated: string

        featured: string[]

        years: {
            year: string

            operations: {
                operation: string

                stages: {
                    stage: string
                    media: string[]
                }[]
            }[]
        }[]
    }

}