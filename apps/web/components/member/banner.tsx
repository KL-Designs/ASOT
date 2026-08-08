'use client'

import Image, { StaticImageData } from 'next/image'
import { useState } from 'react'


import Fallback from '@/public/images/fallback_pfp.png'



export default function Banner({ user }: { user?: User }) {

    // if (!user?.bannerURL) return null
    // const [image, setImage] = useState<string | StaticImageData>(user ? user.bannerURL : Fallback)

    // return (
    //     <Image
    //         src={image}
    //         alt='Profile Banner'
    //         fill
    //         className='object-cover'
    //     />
    // )
}