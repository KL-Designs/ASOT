import Discord from 'discord.js'

import fs from 'node:fs'
import Db from 'lib/mongo.ts'
import { Buffer } from "node:buffer"
import { XMLBuilder, XMLParser } from 'fast-xml-parser'


class ModlistController {

    listPath = './data/lists.json'
    optionalsPath = './data/optionals.json'
    usersPath = './data/users.json'
    htmlPath = './app/commands/modlist/preset.html'

    constructor() {
        if (!fs.existsSync('./data/images')) fs.mkdirSync('./data/images', { recursive: true })
        if (!fs.existsSync('./data/lists.json')) fs.writeFileSync(`./data/lists.json`, JSON.stringify([], null, '\t'))
        if (!fs.existsSync('./data/users.json')) fs.writeFileSync(`./data/users.json`, JSON.stringify([], null, '\t'))
        if (!fs.existsSync('./data/optionals.json')) fs.writeFileSync(`./data/optionals.json`, JSON.stringify([], null, '\t'))
    }


    filterMods(json: any) {
        return json.html.body.div[0].table.tr
    }

    mapMods(json: any): { id: string, name: string }[] {
        json = this.filterMods(json).filter(mod => mod.td[1].span === 'Steam')

        return json.map(mod => {
            const name = mod.td[0]
            const id = mod.td[2].a.split('?id=')[1]
            return { id, name }
        })
    }

    async fetchAttachment(file: Discord.Attachment) {
        const response = await fetch(file.url)
        if (!response.ok) throw new Error('The server failed to download the attachment')

        const parser = new XMLParser()
        const buffer = await response.arrayBuffer()
        return parser.parse(Buffer.from(buffer).toString())
    }

    async downloadBanner(file: Discord.Attachment) {
        const response = await fetch(file.url)
        if (!response.ok) throw new Error('The server failed to download the banner')

        const buffer = await response.arrayBuffer()
        fs.writeFileSync(`./data/images/${file.id}.${file.name.split('.').pop() || 'jpg'}`, Buffer.from(buffer))
    }

    buildBanner(banner: string) {
        const file = fs.readFileSync(`./data/images/${banner}`)
        const buffer = Buffer.from(file)
        return new Discord.AttachmentBuilder(buffer, { name: banner })
    }

    setOptionals(type, json) {
        json = this.mapMods(json)
        Db.optionals.replaceOne({ _id: type }, { mods: json }, { upsert: true })
        // fs.writeFileSync(this.optionalsPath, JSON.stringify(json, null, '\t'))
    }

    fetchOptionals() {
        return JSON.parse(fs.readFileSync(this.optionalsPath, 'utf8')) as { id: string, name: string }[]
    }

    fetchLists() {
        const lists = JSON.parse(fs.readFileSync(this.listPath, 'utf8')) as Modlist[]
        return lists
    }

    fetchList(name: string) {
        const lists = this.fetchLists()
        const list = lists.find(list => list.name === name || list.id === name)
        return list
    }

    updateLists(lists: Modlist[]) {
        fs.writeFileSync(this.listPath, JSON.stringify(lists, null, '\t'))
    }

    addList(modlist: Modlist) {
        const lists = this.fetchLists()
        if (lists.find(list => list.name === modlist.name)) throw new Error('A Modlist with this name already exists!')
        lists.push(modlist)
        this.updateLists(lists)
    }

    removeList(name: string) {
        const lists = this.fetchLists()
        const index = lists.findIndex(list => list.name === name)
        if (index === -1) throw new Error('This modlist does not exist!')

        if (lists[index].banner) fs.rmSync(`./data/images/${lists[index].banner}`)

        lists.splice(index, 1)
        this.updateLists(lists)
    }

    createModFile(modlist: Modlist['mods'], fileName?: string) {
        const mods = modlist.map(mod => {
            function escapeXml(str) {
                return str
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&apos;")
            }

            return `
            <tr data-type="ModContainer">
                <td data-type="DisplayName">${escapeXml(mod.name)}</td>
                <td>
                    <span class="from-steam">Steam</span>
                </td>
                <td>
                    <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.id}" data-type="Link">https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.id}</a>
                </td>
            </tr>
            `
        }).join('')

        const html = Preset(mods, fileName)
        const file = new Discord.AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `${fileName || 'modlist'}.html` })
        return file
    }

    setUserOptionals(user: string, mods: string[]) {
        const userFile: { id: string, mods: string[] }[] = JSON.parse(fs.readFileSync(this.usersPath, 'utf8'))
        const userIndex = userFile.findIndex(u => u.id === user)

        if (userIndex === -1) userFile.push({ id: user, mods: mods })
        else userFile[userIndex].mods = mods

        fs.writeFileSync(this.usersPath, JSON.stringify(userFile, null, '\t'), 'utf8')
    }

    fetchUserOptionals(user: string) {
        const userFile: { id: string, mods: string[] }[] = JSON.parse(fs.readFileSync(this.usersPath, 'utf8'))
        const userIndex = userFile.findIndex(u => u.id === user)

        if (userIndex === -1) return []
        else return userFile[userIndex].mods
    }

    matchOptionals(user: string) {
        const userOpt = this.fetchUserOptionals(user)
        const availableOpt = this.fetchOptionals()
        return userOpt.map((m, i) => {
            const mod = availableOpt.find(a => a.id === m)
            return { id: mod.id, name: mod.name }
        })
    }

}

const iModlist = new ModlistController()
export default iModlist


export function Preset(modlist: string, name: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<html>
  <!--Created by Arma 3 Launcher: https://arma3.com-->
  <head>
    <meta name="arma:Type" content="preset" />
    <meta name="arma:PresetName" content="${name}" />
    <meta name="generator" content="Arma 3 Launcher - https://arma3.com" />
    <title>Arma 3</title>
    <link href="https://fonts.googleapis.com/css?family=Roboto" rel="stylesheet" type="text/css" />
    <style>
body {
	margin: 0;
	padding: 0;
	color: #fff;
	background: #000;	
}

body, th, td {
	font: 95%/1.3 Roboto, Segoe UI, Tahoma, Arial, Helvetica, sans-serif;
}

td {
    padding: 3px 30px 3px 0;
}

h1 {
    padding: 20px 20px 0 20px;
    color: white;
    font-weight: 200;
    font-family: segoe ui;
    font-size: 3em;
    margin: 0;
}

em {
    font-variant: italic;
    color:silver;
}

.before-list {
    padding: 5px 20px 10px 20px;
}

.mod-list {
    background: #222222;
    padding: 20px;
}

.dlc-list {
    background: #222222;
    padding: 20px;
}

.footer {
    padding: 20px;
    color:gray;
}

.whups {
    color:gray;
}

a {
    color: #D18F21;
    text-decoration: underline;
}

a:hover {
    color:#F1AF41;
    text-decoration: none;
}

.from-steam {
    color: #449EBD;
}
.from-local {
    color: gray;
}

</style>
  </head>
  <body>
    <h1>Arma 3  - Preset <strong>${name}</strong></h1>
    <p class="before-list">
      <em>To import this preset, drag this file onto the Launcher window. Or click the MODS tab, then PRESET in the top right, then IMPORT at the bottom, and finally select this file.</em>
    </p>
    <div class="mod-list">
      <table>
        ${modlist}
      </table>
    </div>
    <div class="dlc-list">
      <table />
    </div>
    <div class="footer">
      <span>Created by Arma 3 Launcher by Bohemia Interactive.</span>
    </div>
  </body>
</html>
    `
}