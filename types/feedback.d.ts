import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Feedback {
        _id: ObjectId
        title: string
        type: 'bug' | 'feature'
        description: string
        status: 'open' | 'in_progress' | 'priority' | 'fixed' | 'implemented' | 'wont_fix'
        authorId: string
        authorName: string
        createdAt: Date
        updatedAt: Date
        attachments: string[]
        upvotes: string[]
        upvoteCount: number
        commentCount: number
    }

    interface FeedbackComment {
        _id: ObjectId
        feedbackId: ObjectId
        authorId: string
        authorName: string
        content: string
        createdAt: Date
    }

}
