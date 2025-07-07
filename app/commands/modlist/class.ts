import Discord from 'discord.js'

import fs from 'node:fs'
import { Buffer } from "node:buffer"
import { XMLBuilder, XMLParser } from 'fast-xml-parser'


class ModlistController {

    listPath = './data/lists.json'
    optionalsPath = './data/optionals.json'

    constructor() {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true })
        if (!fs.existsSync('./data/lists.json')) fs.writeFileSync(`./data/lists.json`, JSON.stringify([], null, '\t'))
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

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            allowBooleanAttributes: true,
            preserveOrder: false, // set to true if you need tag order
            isArray: (name, jpath, isLeafNode, isAttribute) => ['mod'].includes(name)
        })
        const buffer = await response.arrayBuffer()
        return parser.parse(Buffer.from(buffer).toString())
    }

    setOptionals(json) {
        json = this.mapMods(json)
        fs.writeFileSync(this.optionalsPath, JSON.stringify(json, null, '\t'))
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

        lists.splice(index, 1)
        this.updateLists(lists)
    }

    createModFile(json: any, fileName?: string) {
        const builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            format: true,
            suppressEmptyNode: false // keeps empty tags
        })
        const xml = builder.build(json)

        const file = new Discord.AttachmentBuilder(Buffer.from(xml, 'utf8'), { name: `${fileName || 'modlist'}.html` })

        return file
    }

}

const iModlist = new ModlistController()
export default iModlist