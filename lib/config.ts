import fs from 'node:fs'

const config: Config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))

export default config