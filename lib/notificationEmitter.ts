import { EventEmitter } from 'events'

declare global {
    // eslint-disable-next-line no-var
    var __notificationEmitter: EventEmitter | undefined
}

// Next.js bundles each route separately, so module-level singletons are not
// shared across routes. Storing on `global` ensures all route handlers share
// the same emitter instance within a single server process.
if (!global.__notificationEmitter) {
    global.__notificationEmitter = new EventEmitter()
    global.__notificationEmitter.setMaxListeners(500)
}

export default global.__notificationEmitter
