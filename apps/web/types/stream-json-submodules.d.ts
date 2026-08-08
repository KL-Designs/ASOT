declare module 'stream-json/filters/pick.js' {
    function pick(options?: { filter?: string | RegExp | string[]; once?: boolean; pathSeparator?: string }): any
    namespace pick { function asStream(options?: any): import('node:stream').Duplex }
    export = pick
}

declare module 'stream-json/streamers/stream-array.js' {
    interface StreamArrayItem { key: number; value: any }
    function streamArray(options?: any): any
    namespace streamArray { function asStream(options?: any): import('node:stream').Duplex }
    export = streamArray
}
