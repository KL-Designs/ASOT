import client from '@/lib/discord'
import { connection } from 'next/server'
import Db from '@/lib/mongo'

import Image from 'next/image'

import { Divider, Paper, Typography } from '@mui/material'


export default async function Page() {

    await connection()

    const users = await Db.users.find({ "guild.roles": { $in: ["745793767185055744"] } }).toArray()

    return (
        <div className='p-5 justify-center'>

            <div className='m-auto flex flex-wrap gap-5 max-w-[1500px] justify-center'>
                {users.map(user => {

                    if (!user.bio?.name || !user.bio?.content || !user.bio?.rank || !user.bio?.callsign) return null

                    return (
                        <Paper key={user.id} className='flex justify-between w-[700px] gap-5 p-3'>
                            <div className='relative h-[100px] min-w-[100px]'>
                                <Image src={user.avatarURL} alt={user.username} fill className='rounded-[100%]' />
                            </div>

                            <div className='w-full flex flex-col gap-2'>
                                <div className='flex justify-between gap-2'>
                                    <div>
                                        <Typography variant='h5' textTransform='uppercase' fontWeight={600} letterSpacing={2}>{user.bio?.name || 'Name'}</Typography>
                                        <Typography variant='body2' textTransform='uppercase' fontWeight={200} fontSize={12} letterSpacing={1} className='m-0'>Joined {new Date(user.guild.joinedTimestamp).toLocaleDateString()}</Typography>
                                    </div>

                                    <div>
                                        <Typography variant='h5' textTransform='uppercase' textAlign='right' fontWeight={600} letterSpacing={2}>{user.bio?.callsign || 'Callsign'}</Typography>
                                        <Typography variant='body2' textTransform='uppercase' textAlign='right' fontWeight={200} fontSize={12} letterSpacing={1} className='m-0'>{user.bio?.rank || 'Rank'}</Typography>
                                    </div>
                                </div>
                                <Divider />
                                <Typography variant='body1'>{user.bio?.content || 'No Bio Filled'}</Typography>
                            </div>

                            <div className='relative h-[100px] min-w-[100px]'>
                                <Image src={`/api/uploads/bio?id=${user.id}&time=${new Date().getTime()}`} alt={user.username} fill />
                            </div>
                        </Paper>
                    )
                })}
            </div>

        </div>
    )
}