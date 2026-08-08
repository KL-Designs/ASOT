import type { ObjectId } from "mongodb"


export { }

declare global {

    interface Platoon {
        _id: ObjectId

        order: number

        name: string
        description: string
        color: string

        sections: Section['_id'][]
    }

    interface Section {
        _id: ObjectId

        order: number

        name: string
        description: string
        color: string
        icon: string | null

        members: {
            user: User['_id']
            role: Role['_id']
        }[]
    }

    interface Role {
        _id: ObjectId

        order: number

        name: string
        abbr: string
        description: string
    }

    interface Rank {
        _id: ObjectId

        order: number

        name: string
        abbr: string
        billets: {
            name: string
            abbr: string
            description: string
            logo: string | null
        }[]

        logo: string | null
    }

    interface Certification {
        _id: ObjectId
        name: string
        description: string
    }

    interface Award {
        _id: ObjectId
        name: string
        description: string
    }

}