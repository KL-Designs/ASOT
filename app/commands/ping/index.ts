import fs from 'node:fs'
import Discord, { ApplicationCommandType, ApplicationCommandOptionType } from 'discord.js'

import { GoogleAuth } from 'google-auth-library'
import { google } from 'googleapis'


export default {
    name: 'ping',
    description: 'Test Ping',
    type: ApplicationCommandType.ChatInput,

    async execute(interaction) {
        interaction.reply({ content: `Responded in ${interaction.client.ws.ping}ms`, ephemeral: true })

        // const credentials = JSON.parse(
        //     fs.readFileSync('./asot-474311-b5339a7b1286.json', 'utf8')
        // )

        // const auth = new google.auth.JWT({
        //     email: credentials.client_email,
        //     key: credentials.private_key,
        //     scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        // })
        // const service = google.sheets({ version: 'v4', auth })

        // const cells = [
        //     '0-A/J6:R6',
        //     '1-0/J9:R12',
        //     '1-0-Zulu/W65:Z70',

        //     '1-1-0/C15:F18',
        //     '1-1-1/C21:F28',
        //     '1-1-2/C30:F37',
        //     '1-1-3/C39:F46',

        //     '1-2-0/I15:L18',
        //     '1-2-1/I21:L28',
        //     '1-2-2/I30:L37',
        //     '1-2-3/I39:L46',

        //     '1-3-0/Q15:T19',
        //     '1-3-Echo/Q21:T30',
        //     '1-3-Golf/Q32:T37',
        //     '1-3-Hotel/Q39:T50',
        //     '1-3-Mike/Q52:T57',
        //     '1-3-Victor/Q59:T70',

        //     'RESERVIST-ACTIVE/W15:Z38',
        //     'RESERVIST-INACTIVE/W40:Z63',
        // ]

        // for (const cell of cells) {
        //     const vars = cell.split('/')
        //     const section = vars[0]
        //     const coords = vars[1]

        //     const result = await service.spreadsheets.values.get({
        //         spreadsheetId: '1rkzQSPimBYV3UDp-CFHUfQo59yww_xbj9UTPGWBzSL0',
        //         range: `'ASOT - ORBAT'!${coords}`
        //     })

        //     const numRows = result.data.values ? result.data.values.length : 0
        //     console.log(`${numRows} rows for ${section}`)
        //     console.table(result.data.values.map(r => r.filter(v => v)))
        // }

    }
} as ChatCommand