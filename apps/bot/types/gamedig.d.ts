// gamedig ships no type declarations of its own and there's no @types/gamedig package;
// only the query() shape actually used by app/commands/stats/dig.ts is typed here.
declare module 'gamedig' {
    export interface QueryOptions {
        type: string
        host: string
        port: number
        socketTimeout?: number
    }

    export interface QueryResult {
        numplayers: number
        maxplayers: number
        map?: string
        version?: string
        raw?: any
        [key: string]: any
    }

    export class GameDig {
        static query(options: QueryOptions): Promise<QueryResult>
    }
}
