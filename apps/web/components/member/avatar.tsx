'use client'

import Image, { StaticImageData } from 'next/image'
import { useEffect, useState } from 'react'

import Fallback from '@/public/images/fallback_pfp.png'
import { defaultAvatarURL } from '@/lib/discord/avatar'



function resolveAvatar(user?: AvatarUser): string | StaticImageData {
    if (user?.avatarURL) return user.avatarURL
    return user?.id ? defaultAvatarURL(user.id) : Fallback
}

/**
 * Only `id` and `avatarURL` are read, so the prop is narrowed to those. A full
 * `User` still satisfies it structurally, but callers in server components can
 * now pass just the two fields — passing the whole Mongo document sends
 * ObjectIds across the server/client boundary, which React warns about.
 */
type AvatarUser = Pick<User, 'id' | 'avatarURL'>

export default function Avatar({ user, borderRadius = '100%', sizes = '160px' }: {
    user?: AvatarUser,
    borderRadius?: string,
    /**
     * How wide this avatar actually renders. `fill` with no `sizes` makes
     * next/image assume `100vw` and emit a srcset all the way up to 3840w, so
     * the browser was picking a ~2048px raster to paint a 54px circle. Every
     * avatar on the site is a small chip or circle; the default covers the
     * largest of them (the milpac hero, 148px at its widest) and callers with
     * something smaller should say so.
     */
    sizes?: string,
}) {

    const [image, setImage] = useState<string | StaticImageData>(() => resolveAvatar(user))

    useEffect(() => setImage(resolveAvatar(user)), [user])

    return (
        <Image
            src={image}
            alt='Profile Picture'
            fill
            sizes={sizes}
            className='object-cover'
            style={{ borderRadius }}
            onError={() => setImage(user?.id ? defaultAvatarURL(user.id) : Fallback)}
        />
    )
}