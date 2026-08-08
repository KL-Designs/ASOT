import reminder_setup from './reminder_setup/index.ts'

const modals: { [key: string]: (interaction: unknown, args: string[]) => unknown } = {
    reminder_setup
}


export default modals