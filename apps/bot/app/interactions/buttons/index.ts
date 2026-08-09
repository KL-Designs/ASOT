import modlist from './modlist/index.ts'
import reminder from './reminder/index.ts'
import reminder_setup from './reminder_setup/index.ts'
import reminder_admin from './reminder_admin/index.ts'


const buttons: { [key: string]: any } = {
    modlist,
    reminder,
    reminder_setup,
    reminder_admin,
}


export default buttons