import channelUpdate from "./channelUpdate/index.ts"
import guildMemberAdd from "./guildMemberAdd/index.ts"
import guildMemberRemove from "./guildMemberRemove/index.ts"
import messageCreate from "./messageCreate/index.ts"
import messageUpdate from "./messageUpdate/index.ts"
import voiceStateUpdate from "./voiceStateUpdate/index.ts"
import guildMemberUpdate from "./guildMemberUpdate/index.ts"


const events: { [key: string]: any } = {
    channelUpdate,
    guildMemberAdd,
    guildMemberRemove,
    messageCreate,
    messageUpdate,
    voiceStateUpdate,
    guildMemberUpdate
}


export default events