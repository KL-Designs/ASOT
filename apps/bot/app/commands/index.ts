import ping from './ping/index.ts'

import modlist from "./modlist/index.ts"
import reminder from "./reminder/index.ts"
import stats from "./stats/index.ts"
import song from "./song/index.ts"
import milpac from "./milpac/index.ts"
// import recruitment from './recruitment/menu.ts'
// import promote from './promote/menu.ts'
// import award from './award/menu.ts'


export const ChatCommands = [
    ping,
    modlist,
    reminder,
    stats,
    song,
    milpac,
]

export const UserContextCommands = [
    // recruitment,
    // promote,
    // award
]

export default ChatCommands.concat(UserContextCommands as any[])