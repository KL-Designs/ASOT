import "./landing.css"

import Image, { StaticImageData } from 'next/image'




export default function Container({ children, title, subtitle, background, backgroundUrl, sx }: {
    children?: React.ReactNode,
    title?: string,
    subtitle?: string,
    background?: StaticImageData,
    backgroundUrl?: string,
    sx?: {
        maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | (string & {}),
        bannerHeight?: 'xsm' | 'sm' | 'md' | 'lg',
        padding?: string,
        gap?: string | undefined
    }
}) {

    let bannerHeight: string
    switch (sx?.bannerHeight) {
        case 'xsm': bannerHeight = 'h-banner-xsm md:h-banner-xsm-md'; break
        case 'sm': bannerHeight = 'h-banner-sm md:h-banner-sm-md'; break
        case 'md': bannerHeight = 'h-banner-md md:h-banner-md-md'; break
        case 'lg': bannerHeight = 'h-banner-lg md:h-banner-lg-md'; break
        default: bannerHeight = 'h-banner-md md:h-banner-md-md'; break
    }

    return (
        <div className='h-full w-full'>

            <div className={`relative w-full ${bannerHeight} flex flex-col justify-end items-center overflow-hidden`}>
                {backgroundUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={backgroundUrl} alt='Banner' className='absolute inset-0 w-full h-full object-cover object-center' />
                    : <Image src={background || '/images/fallback.webp'} alt='Banner' fill className='object-cover object-center' loading='eager' />
                }

                {/* Gradient overlay — dark top edge, heavy fade to page bg at bottom */}
                <div className='absolute inset-0' style={{
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.2) 40%, rgba(10,10,10,0.7) 75%, #0a0a0a 100%)'
                }} />

                <div className='relative z-10 flex flex-col items-center gap-3 pb-10 px-6 text-center w-full'>
                    <h1 className='container-h1'>{title || 'PAGE TITLE'}</h1>
                    <div className='flex items-center gap-3 w-full' style={{ maxWidth: 360 }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.2)' }} />
                        <div style={{ height: 2, width: 48, background: 'var(--red)' }} />
                        <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.2)' }} />
                    </div>
                    {subtitle && <h2 className="container-h2 max-w-[400px] md:max-w-[680px]" style={{ opacity: 0.8 }}>{subtitle}</h2>}
                </div>
            </div>


            <div>
                <div className={`w-full m-auto flex flex-col ${sx?.gap ? sx.gap : 'gap-10'} ${sx?.maxWidth || 'max-w-md'}`} style={{ padding: sx?.padding || '2rem 2rem' }}>

                    {children}

                </div>
            </div>

        </div>
    )
}