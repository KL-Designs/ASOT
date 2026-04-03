import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'


// let cache: [number, Date] = [0, new Date(0)]


export async function GET(request: NextRequest) {

    const members = await Db.orbatPositions.find({ userId: { $ne: null }, category: { $ne: 'inactiveReservist' } }).toArray()

    // if (new Date().getTime() - cache[1].getTime() >= 1000 * 60 * 30) {

    //     let count = 0

    //     const body = await fetch(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members?limit=1000`, {
    //         headers: {
    //             authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    //             'Content-Type': 'application/json'
    //         }
    //     })

    //     const data = await body.json()

    //     data.forEach((member: { roles: string[] }) => {
    //         if (member.roles.includes('1110471500563239012')) count++
    //     })

    //     cache = [count, new Date()]

    //     console.log('Updated member count:', count)
    // }

    return NextResponse.json({ count: members.length }, { status: 200 })

}