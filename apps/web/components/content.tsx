import Image, { StaticImageData } from 'next/image'

import { Typography, Divider } from '@mui/material'



export function ContentText({ children, className, title, titlePos }: { children: React.ReactNode, className?: string, title: string, titlePos?: 'center' | 'left' | 'right' }) {
    return (
        <div className={`w-full flex flex-row justify-center gap-x-14 ${className}`}>
            <div className='w-full flex flex-col gap-y-5'>
                <h2 style={{ textAlign: titlePos, fontWeight: 500 }}>
                    {title}
                </h2>
                <Divider style={{ backgroundColor: 'var(--red)' }} />
                <div>
                    {children}
                </div>
            </div>
        </div >
    )
}


export function ContentWithImage({ children, title, images, imageSide, imagePos, titlePos }: { children: React.ReactNode, title: string, images: StaticImageData[], imageSide?: 'left' | 'right', imagePos?: 'start' | 'center' | 'end', titlePos?: 'center' | 'left' | 'right' }) {

    const ImageWrapper = () => (
        <div className={`self-${imagePos || 'center'} flex flex-col gap-5`}>
            {images.map((image, i) => (
                <Image key={i} className='rounded-lg' src={image} alt={title} />
            ))}
        </div>
    )


    return (
        <div className='w-full grid grid-cols-1 md:grid-cols-2 gap-14'>
            <div className={`hidden self-center ${imageSide === 'left' || !imageSide ? 'md:block' : 'md:hidden'}`}>
                <ImageWrapper />
            </div>

            <div className='flex flex-col gap-y-8 self-center'>
                <h2 style={{ fontWeight: 500 }}>{title}</h2>
                <Divider style={{ backgroundColor: 'var(--red)' }} />
                <div>
                    {children}
                </div>
            </div>

            <div className={`self-center ${imageSide === 'right' ? 'md:block' : 'md:hidden'}`}>
                <ImageWrapper />
            </div>
        </div>
    )
}


export function ContentBanner({ children, title, image }: { children: React.ReactNode, title: string, image: StaticImageData }) {
    return (
        <div className='relative w-full h-[500px] md:h-[400px] lg:h-[300px] flex flex-col overflow-hidden'>

            <Image src={image} alt='Banner' fill className='object-cover blur-[1px] rounded-lg' />

            <div className='p-5 absolute flex flex-col gap-y-8 self-center' style={{ background: 'linear-gradient(#0a0a0a, transparent)' }}>
                <Typography className='text-[36px]' align='center' variant='h2' fontWeight={600} letterSpacing={10}>{title.toUpperCase()}</Typography>
                <Divider style={{ backgroundColor: 'var(--red)' }} />
                <div>
                    {children}
                </div>
            </div>

        </div>
    )
}

export default ContentText