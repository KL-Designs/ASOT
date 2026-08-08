import type { ObjectId } from 'mongodb'


export { }

declare global {

    interface BoardColumn {
        _id: ObjectId
        department: string     // 'j7' for this build; department-scoped like every other dept tab
        title: string
        order: number
        createdAt: Date
        createdBy: string
        createdByName: string
    }

    interface BoardCard {
        _id: ObjectId
        department: string
        columnId: ObjectId
        title: string
        description?: string
        assigneeId?: string       // Discord ID
        assigneeName?: string     // denormalized display name, set alongside assigneeId
        linkedTaskId?: ObjectId   // optional reference into Db.tasks — resolved live on read, never duplicated
        order: number
        createdAt: Date
        createdBy: string
        createdByName: string
    }

}
