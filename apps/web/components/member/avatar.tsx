'use client'

import Image, { StaticImageData } from 'next/image'
import { useState } from 'react'


import Fallback from '@/public/images/fallback_pfp.png'



export default function Avatar({ user, borderRadius = '100%' }: { user?: User, borderRadius?: string }) {

    const [image, setImage] = useState<string | StaticImageData>(user ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}?size=256` : Fallback)

    return (
        <Image
            src={image}
            alt='Profile Picture'
            fill
            className='object-cover'
            style={{ borderRadius }}
            onError={(e) => setImage(Fallback)}
        />
    )
}