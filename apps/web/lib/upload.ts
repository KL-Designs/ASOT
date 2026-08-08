import fs from 'fs'
import { ObjectId } from 'mongodb'


export async function Upload(id: string, type: string, File: File, remove?: string) {
    const ext = File.name.split('.').pop()
    const path = `./.uploads/${type}/${new ObjectId().toString()}.${ext}`

    if (!fs.existsSync('./.uploads')) fs.mkdirSync('./.uploads')
    if (!fs.existsSync(`./.uploads/${type}`)) fs.mkdirSync(`./.uploads/${type}`)

    if (remove) fs.rmSync(`./.uploads/${type}/${remove}`, { force: true })

    const buffer = Buffer.from(await File.arrayBuffer())
    fs.writeFileSync(path, new Uint8Array(buffer))

    return path.split('/').pop()
}

export async function Remove(type: string, file?: string) {
    if (!file) return false
    const ext = file.split('.').pop()
    const path = `./.uploads/${type}/${file}.${ext}`

    if (!fs.existsSync('./.uploads')) fs.mkdirSync('./.uploads')
    if (!fs.existsSync(`./.uploads/${type}`)) fs.mkdirSync(`./.uploads/${type}`)

    fs.rmSync(`./.uploads/${type}/${file}`, { force: true })

    return true
}

