import type { ObjectId } from 'mongodb'

export { }

declare global {

    /**
     * Row 372 (Part B): a Leadership course's Assessment Orders: the source
     * orders (one per scenario variant) and the template trainees fill.
     * Collection `orders_assessment_configs`, keyed by training type id.
     */
    interface OrdersAssessmentConfig {
        _id: string
        trainingTypeName: string
        orders: import('@/lib/training/orders-assessment').SourceOrders[]
        template: import('@/lib/training/orders-assessment').AssessmentTemplate
        updatedAt: Date
        updatedById: string
        updatedByName: string
    }

    /**
     * Row 373 (Parts D to G): one trainee's orders-writing assessment.
     * Collection `orders_assessments`. The orders and template are frozen
     * copies taken at assignment, so editing the master never changes an
     * issued copy. `similarity` is only ever sent to the assigned trainer,
     * J3 leads and J4.
     */
    interface OrdersAssessment {
        _id?: ObjectId
        trainingTypeId: string
        trainingTypeName: string
        /** The training occurrence it belongs to, when there is one. */
        session: { kind: 'instance' | 'event'; id: string; label: string } | null
        traineeId: string
        traineeName: string
        trainerId: string
        trainerName: string
        variant: number
        orders: import('@/lib/training/orders-assessment').SourceOrders
        /** The trainee's private copy of the source operation, when the variant is one. They write their orders in it. */
        operationId?: string | null
        template: import('@/lib/training/orders-assessment').AssessmentTemplate
        answers: Record<string, string>
        status: import('@/lib/training/orders-assessment').AssessmentStatus
        submittedAt?: Date | null
        similarity?: import('@/lib/training/similarity').SimilarityResult | null
        review?: { outcome: 'passed' | 'failed' | 'reassessment_required'; comment: string; byId: string; byName: string; at: Date } | null
        /** Earlier attempts, kept when a reassessment issues a new copy. */
        attempts: {
            variant: number
            /** That attempt's copy of the orders, kept read-only. */
            operationId?: string | null
            /** The template that attempt was written against, if it has since changed. */
            template?: import('@/lib/training/orders-assessment').AssessmentTemplate
            answers: Record<string, string>
            submittedAt?: Date | null
            similarity?: import('@/lib/training/similarity').SimilarityResult | null
            review?: OrdersAssessment['review']
        }[]
        history: { at: Date; status: string; byId: string; byName: string }[]
        createdAt: Date
        updatedAt: Date
    }
}
