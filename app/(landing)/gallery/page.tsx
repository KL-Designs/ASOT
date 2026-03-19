'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Button, Divider, CircularProgress } from '@mui/material'
import { Reply, Close, ZoomIn, ArrowBackIos, ArrowForwardIos } from '@mui/icons-material'

function GalleryImage({ src, alt, onClick }: { src: string, alt: string, onClick: () => void }) {
    const [loaded, setLoaded] = useState(false)
    return (
        <div
            className='relative w-full overflow-hidden cursor-pointer group'
            style={{ aspectRatio: '16/10' }}
            onClick={onClick}
        >
            {!loaded && (
                <div className='absolute inset-0 flex items-center justify-center' style={{ background: 'rgba(10,10,10,0.6)' }}>
                    <CircularProgress size={28} style={{ color: 'var(--red)' }} />
                </div>
            )}
            <Image
                className='object-cover transition-transform duration-300 group-hover:scale-105'
                src={src}
                alt={alt}
                fill
                loading='lazy'
                onLoad={() => setLoaded(true)}
            />
            <div className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center'
                style={{ background: 'linear-gradient(to bottom, rgba(219,0,29,0.08), rgba(0,0,0,0.55))' }}>
                <div style={{
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: '50%',
                    padding: 8,
                    color: 'rgba(255,255,255,0.9)',
                    display: 'flex',
                    backdropFilter: 'blur(2px)',
                    background: 'rgba(0,0,0,0.25)',
                }}>
                    <ZoomIn style={{ fontSize: 22 }} />
                </div>
            </div>
        </div>
    )
}

import { useEffect, useState } from "react"


export default function Page() {

    const router = useRouter()

    const [ready, setReady] = useState(false)
    const [data, setData] = useState<GalleryAPI['years']>([] as GalleryAPI['years'])
    const [year, setYear] = useState('')
    const [operation, setOperation] = useState('')
    const [stage, setStage] = useState('')

    const [openImgIndex, setOpenImgIndex] = useState<number | null>(null)
    const [openFeaturedImg, setOpenFeaturedImg] = useState('')
    const [featured, setFeatured] = useState<string[]>([])

    useEffect(() => {

        const searchParams = new URLSearchParams(window.location.search)

        setYear(searchParams.get('year') || '')
        setOperation(searchParams.get('operation') || '')
        setStage(searchParams.get('stage') || '')

        fetch('/api/gallery')
            .then(res => res.json())
            .then((json: GalleryAPI) => {
                console.log(json)
                setData(json.years)

                const yearI = json.years.length - 1
                const operationI = json.years[yearI].operations.length - 1
                const stageI = json.years[yearI].operations[operationI].stages.length - 1

                if (!searchParams.get('year')) setYear(json.years[yearI].year)
                if (!searchParams.get('operation')) setOperation(json.years[yearI].operations[operationI].operation)
                if (!searchParams.get('stage')) setStage(json.years[yearI].operations[operationI].stages[stageI].stage)

                setFeatured([...json.featured].sort(() => Math.random() - 0.5))

                setReady(true)
            })
            .catch(err => {
                console.error('Failed to fetch gallery data:', err)
            })
    }, [])

    useEffect(() => {
        router.push(`?year=${year}&operation=${operation}&stage=${stage}`)
    }, [year, operation, stage])

    useEffect(() => {
        if (!ready) return
        const operation = data.find(y => y.year === year)?.operations[0].operation || ''
        const stage = data.find(y => y.year === year)?.operations[0].stages[0].stage || ''

        setOperation(operation)
        setStage(stage)
    }, [year])

    useEffect(() => {
        if (!ready) return
        const stage = data.find(y => y.year === year)?.operations[0].stages[0].stage || ''
        setStage(stage)
    }, [operation])

    const currentMedia = data.find(g => g.year === year)?.operations.find(op => op.operation === operation)?.stages.find(s => s.stage === stage)?.media ?? []

    useEffect(() => {
        if (openImgIndex === null) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') setOpenImgIndex(i => (i !== null && i > 0) ? i - 1 : i)
            if (e.key === 'ArrowRight') setOpenImgIndex(i => (i !== null && i < currentMedia.length - 1) ? i + 1 : i)
            if (e.key === 'Escape') setOpenImgIndex(null)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [openImgIndex, currentMedia.length])

    return (
        <div className='w-full mx-auto flex flex-col gap-8 max-w-[1500px]'>

            <div className='w-full flex flex-col justify-center items-center gap-5'>

                <div className='w-full overflow-hidden relative' style={{ height: '252px', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
                    <div
                        className='carousel-track flex items-center h-full absolute left-0 top-0'
                        style={{ animationDuration: `${featured.length * 8}s`, width: 'max-content' }}
                    >
                        {[...featured, ...featured].map((img, i) => (
                            <div key={i} className='relative h-[200px] w-[320px] flex-shrink-0 cursor-pointer transition-all duration-300 hover:scale-110 hover:mx-6 hover:z-10 mx-2'
                                onClick={() => setOpenFeaturedImg(`/api/gallery/featured?img=${img}`)}>
                                <Image
                                    className='object-cover rounded-sm'
                                    src={`${process.env.NEXT_PUBLIC_BASEURL}/api/gallery/featured?img=${img}`}
                                    alt={img}
                                    quality={75}
                                    loading='eager'
                                    fill
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Divider flexItem />

            <div className='w-full flex flex-col gap-8'>

                {/* Filter Bar */}
                <div className='w-full flex flex-col md:flex-row' style={{
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}>

                    {/* YEAR */}
                    <div className='flex flex-col gap-2 p-4 md:p-5 flex-1 min-w-0'>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--red)', textTransform: 'uppercase', opacity: 0.85 }}>Year</span>
                        <div className='flex flex-row md:flex-col gap-1 flex-wrap'>
                            {data.map((g) => (
                                <button key={g.year} onClick={() => setYear(g.year)} style={{
                                    background: g.year === year ? 'rgba(219,0,29,0.12)' : 'transparent',
                                    border: `1px solid ${g.year === year ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                    borderLeft: `3px solid ${g.year === year ? 'var(--red)' : 'rgba(255,255,255,0.08)'}`,
                                    color: g.year === year ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
                                    fontSize: '0.75rem', fontWeight: g.year === year ? 600 : 400,
                                    letterSpacing: '0.08em', padding: '5px 10px',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'all 0.15s ease',
                                }}>{g.year}</button>
                            )).reverse()}
                        </div>
                    </div>

                    <div className='hidden md:block' style={{ width: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
                    <div className='block md:hidden' style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

                    {/* OPERATION */}
                    <div className='flex flex-col gap-2 p-4 md:p-5 flex-1 min-w-0'>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--red)', textTransform: 'uppercase', opacity: 0.85 }}>Operation</span>
                        <div className='flex flex-row gap-1 flex-wrap'>
                            {data.find(g => g.year === year)?.operations.slice().sort((a, b) => {
                                const numA = parseInt(a.operation.match(/^\d+/)?.[0] || '0', 10)
                                const numB = parseInt(b.operation.match(/^\d+/)?.[0] || '0', 10)
                                return numA - numB
                            }).map(op => (
                                <button key={op.operation} onClick={() => setOperation(op.operation)} style={{
                                    background: op.operation === operation ? 'rgba(219,0,29,0.12)' : 'transparent',
                                    border: `1px solid ${op.operation === operation ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                    borderBottom: `2px solid ${op.operation === operation ? 'var(--red)' : 'rgba(255,255,255,0.08)'}`,
                                    color: op.operation === operation ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
                                    fontSize: '0.75rem', fontWeight: op.operation === operation ? 600 : 400,
                                    letterSpacing: '0.04em', padding: '5px 12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}>{op.operation}</button>
                            ))}
                        </div>
                    </div>

                    <div className='hidden md:block' style={{ width: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
                    <div className='block md:hidden' style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

                    {/* MISSION */}
                    <div className='flex flex-col gap-2 p-4 md:p-5 flex-1 min-w-0'>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--red)', textTransform: 'uppercase', opacity: 0.85 }}>Mission</span>
                        <div className='flex flex-row md:flex-col gap-1 flex-wrap'>
                            {data.find(g => g.year === year)?.operations.find(op => op.operation === operation)?.stages.map(s => (
                                <button key={s.stage} onClick={() => setStage(s.stage)} style={{
                                    background: s.stage === stage ? 'rgba(219,0,29,0.12)' : 'transparent',
                                    border: `1px solid ${s.stage === stage ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                    borderLeft: `3px solid ${s.stage === stage ? 'var(--red)' : 'rgba(255,255,255,0.08)'}`,
                                    color: s.stage === stage ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
                                    fontSize: '0.75rem', fontWeight: s.stage === stage ? 600 : 400,
                                    letterSpacing: '0.04em', padding: '5px 10px',
                                    cursor: 'pointer', textAlign: 'left',
                                    transition: 'all 0.15s ease',
                                }}>{s.stage}</button>
                            ))}
                        </div>
                    </div>
                </div>


                {/* Image Grid */}
                <div className='w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2'>
                    {currentMedia.map((img, i) => (
                        <GalleryImage
                            key={img}
                            src={`${process.env.NEXT_PUBLIC_BASEURL}/api/gallery/fetch?stage=${stage}&operation=${operation}&year=${year}&img=${img}`}
                            alt={img}
                            onClick={() => setOpenImgIndex(i)}
                        />
                    ))}
                </div>

                {/* Grid Lightbox */}
                {openImgIndex !== null && (() => {
                    const img = currentMedia[openImgIndex]
                    const imgUrl = `/api/gallery/fetch?stage=${encodeURIComponent(stage)}&operation=${encodeURIComponent(operation)}&year=${encodeURIComponent(year)}&img=${encodeURIComponent(img)}`
                    return (
                        <div className='fixed inset-0 z-50 flex items-center justify-center'
                            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
                            onClick={(e) => e.target === e.currentTarget ? setOpenImgIndex(null) : null}
                        >
                            {/* Prev */}
                            <button
                                onClick={() => setOpenImgIndex(i => i! - 1)}
                                disabled={openImgIndex === 0}
                                style={{
                                    position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                    color: openImgIndex === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)',
                                    borderRadius: 4, padding: '12px 10px', cursor: openImgIndex === 0 ? 'default' : 'pointer',
                                    display: 'flex', backdropFilter: 'blur(4px)', transition: 'all 0.15s',
                                }}
                            ><ArrowBackIos style={{ fontSize: 20 }} /></button>

                            {/* Image */}
                            <div className='relative w-full h-full max-w-6xl p-4 md:p-16'>
                                <Image key={imgUrl} className='object-contain' src={process.env.NEXT_PUBLIC_BASEURL + imgUrl} alt={img} quality={100} fill />
                            </div>

                            {/* Next */}
                            <button
                                onClick={() => setOpenImgIndex(i => i! + 1)}
                                disabled={openImgIndex === currentMedia.length - 1}
                                style={{
                                    position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                    color: openImgIndex === currentMedia.length - 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)',
                                    borderRadius: 4, padding: '12px 10px', cursor: openImgIndex === currentMedia.length - 1 ? 'default' : 'pointer',
                                    display: 'flex', backdropFilter: 'blur(4px)', transition: 'all 0.15s',
                                }}
                            ><ArrowForwardIos style={{ fontSize: 20 }} /></button>

                            {/* Top controls */}
                            <div className='absolute top-4 right-4 flex gap-2'>
                                <Button size='small' variant='contained' color='inherit'
                                    style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', minWidth: 0, padding: '6px 12px' }}
                                    onClick={() => { navigator.clipboard.writeText(process.env.NEXT_PUBLIC_BASEURL + imgUrl); alert('Copied!') }}
                                ><Reply style={{ fontSize: 16 }} /></Button>
                                <Button size='small' variant='contained' color='inherit'
                                    style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', minWidth: 0, padding: '6px 12px' }}
                                    onClick={() => setOpenImgIndex(null)}
                                ><Close style={{ fontSize: 16 }} /></Button>
                            </div>

                            {/* Counter */}
                            <div className='absolute bottom-4 left-1/2 -translate-x-1/2'
                                style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
                                {openImgIndex + 1} / {currentMedia.length}
                            </div>
                        </div>
                    )
                })()}

                {/* Featured Lightbox */}
                {openFeaturedImg && (
                    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 md:p-16'
                        style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
                        onClick={(e) => e.target === e.currentTarget ? setOpenFeaturedImg('') : null}
                    >
                        <div className='relative w-full h-full max-w-6xl'>
                            <Image key={openFeaturedImg} className='object-contain' src={process.env.NEXT_PUBLIC_BASEURL + openFeaturedImg} alt='' quality={100} fill />
                        </div>
                        <Button size='small' variant='contained' color='inherit'
                            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', minWidth: 0, padding: '6px 12px' }}
                            onClick={() => setOpenFeaturedImg('')}
                        ><Close style={{ fontSize: 16 }} /></Button>
                    </div>
                )}
            </div>
        </div>
    )
}
