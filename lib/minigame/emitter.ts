import { EventEmitter } from 'events'

declare global {
    var __minigameEmitter: EventEmitter | undefined
}

if (!global.__minigameEmitter) {
    global.__minigameEmitter = new EventEmitter()
    global.__minigameEmitter.setMaxListeners(500)
}

export default global.__minigameEmitter as EventEmitter
