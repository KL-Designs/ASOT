import type { Collection, Document } from 'mongodb'

/**
 * Row 373: trainees' private copies of assessment orders live in the
 * `operations` collection, because that is what the editor, the collab
 * server and every page under /operations/[id] read. They must never show
 * up anywhere an operation is listed: the board, the calendar, the landing
 * page, billets, campaigns, crons.
 *
 * Rather than trust each of those queries to remember, `Db.operations` is
 * wrapped so every query that is not by `_id` gets `assessment: { $exists:
 * false }` added. A query that names `_id` (opening one operation) or
 * mentions `assessment` itself (code that means to see them) is left alone.
 * Who may open a copy by id is decided in `lib/training/assessment-operation.ts`.
 */

const HIDE = { $exists: false }

const opensById = (filter: Document) => '_id' in filter || Object.keys(filter).some(k => k === 'assessment' || k.startsWith('assessment.'))

export function scopeFilter<T extends Document>(filter: T | undefined | null): Document {
    if (!filter || typeof filter !== 'object') return { assessment: HIDE }
    return opensById(filter) ? filter : { ...filter, assessment: HIDE }
}

export function scopePipeline(pipeline: Document[] | undefined): Document[] {
    const stages = Array.isArray(pipeline) ? pipeline : []
    const first = stages[0]
    // $geoNear and friends must come first; nothing here uses them, but never break one.
    if (first && Object.keys(first).some(k => k === '$geoNear' || k === '$search' || k === '$collStats' || k === '$indexStats')) return stages
    if (first?.$match && opensById(first.$match)) return stages
    return [{ $match: { assessment: HIDE } }, ...stages]
}

const FILTER_FIRST = new Set([
    'find', 'findOne', 'countDocuments', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
    'replaceOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
])

export function hidePrivateOperations<T extends Document>(collection: Collection<T>): Collection<T> {
    return new Proxy(collection, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver)
            if (typeof value !== 'function') return value
            if (typeof prop === 'string' && FILTER_FIRST.has(prop)) {
                return (filter?: Document, ...rest: unknown[]) => value.call(target, scopeFilter(filter), ...rest)
            }
            if (prop === 'distinct') return (key: string, filter?: Document, ...rest: unknown[]) => value.call(target, key, scopeFilter(filter), ...rest)
            if (prop === 'aggregate') return (pipeline?: Document[], ...rest: unknown[]) => value.call(target, scopePipeline(pipeline), ...rest)
            return value.bind(target)
        },
    })
}
