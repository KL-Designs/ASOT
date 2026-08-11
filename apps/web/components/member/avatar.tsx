'use client'

import Image, { StaticImageData } from 'next/image'
import { useEffect, useState } from 'react'

import Fallback from '@/public/images/fallback_pfp.png'
import { defaultAvatarURL } from '@/lib/discord/avatar'



function resolveAvatar(user?: User): string | StaticImageData {
    if (user?.avatarURL) return user.avatarURL
    return user?.id ? defaultAvatarURL(user.id) : Fallback
}

export default function Avatar({ user, borderRadius = '100%' }: { user?: User, borderRadius?: string }) {

    const [image, setImage] = useState<string | StaticImageData>(() => resolveAvatar(user))

    useEffect(() => setImage(resolveAvatar(user)), [user])

    return (
        <Image
            src={image}
            alt='Profile Picture'
            fill
            className='object-cover'
            style={{ borderRadius }}
            onError={() => setImage(user?.id ? defaultAvatarURL(user.id) : Fallback)}
        />
    )
}