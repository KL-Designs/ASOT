'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Typography, Button, Divider } from '@mui/material'
import { Reply, Close } from '@mui/icons-material'

import { useEffect, useState } from "react"


export default function Page() {

    const router = useRouter()

    const [ready, setReady] = useState(false)
    const [data, setData] = useState<GalleryAPI['years']>([] as GalleryAPI['years'])
    const [year, setYear] = useState('')
    const [operation, setOperation] = useState('')
    const [stage, setStage] = useState('')

    const [openImg, setOpenImg] = useState('')
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

    return (
        <div className='w-full flex flex-col justify-between items-center gap-8 max-w-[1500px]'>

            <div className='w-full flex flex-col justify-center items-center gap-5'>
                <Typography className='text-[40px]' variant='h1' align='center' fontWeight={700} fontFamily={'inherit'} letterSpacing={10}>FEATURED</Typography>

                <div className='w-full overflow-hidden relative' style={{ height: '252px', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
                    <div
                        className='carousel-track flex items-center h-full absolute left-0 top-0'
                        style={{ animationDuration: `${featured.length * 8}s`, width: 'max-content' }}
                    >
                        {[...featured, ...featured].map((img, i) => (
                            <div key={i} className='relative h-[200px] w-[320px] flex-shrink-0 cursor-pointer transition-all duration-300 hover:scale-110 hover:mx-6 hover:z-10 mx-2'
                                onClick={() => setOpenImg(`/api/gallery/featured?img=${img}`)}>
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

            <div className='min-h-[600px] w-full flex flex-row flex-wrap justify-center gap-5'>
                <div className='w-full flex flex-col md:flex-row md:flex-wrap gap-6 md:gap-10 justify-center max-w-[1400px]'>
                    <div className='flex flex-col gap-2 flex-grow'>
                        <Typography className='text-[40px]' variant='h1' align='center' fontWeight={700} fontFamily={'inherit'} letterSpacing={4}>
                            YEAR
                        </Typography>

                        {data.map((g) => (
                            <Button key={g.year} fullWidth variant='contained' color={g.year === year ? 'primary' : 'secondary'} onClick={() => setYear(g.year)}>{g.year}</Button>
                        )).reverse()}
                    </div>

                    <div className='flex flex-col gap-2 flex-grow w-full md:max-w-[50%]'>
                        <Typography sx={{ textTransform: 'none' }} className='text-[40px]' variant='h1' align='center' fontWeight={700} fontFamily={'inherit'} letterSpacing={4}>
                            OPERATION
                        </Typography>

                        <div className='flex flex-row gap-2 flex-wrap justify-evenly'>
                            {data.find(g => g.year === year)?.operations.slice().sort((a, b) => {
                                const numA = parseInt(a.operation.match(/^\d+/)?.[0] || "0", 10)
                                const numB = parseInt(b.operation.match(/^\d+/)?.[0] || "0", 10)
                                return numA - numB
                            }).map(op => (
                                <Button key={op.operation} sx={{ textTransform: 'none' }} className='flex-grow' variant='contained' color={op.operation === operation ? 'primary' : 'secondary'} onClick={() => setOperation(op.operation)}>{op.operation}</Button>
                            ))}
                        </div>
                    </div>

                    <div className='flex flex-col gap-2 flex-grow'>
                        <Typography className='text-[40px]' variant='h1' align='center' fontWeight={700} fontFamily={'inherit'} letterSpacing={4}>
                            MISSION
                        </Typography>

                        {data.find(g => g.year === year)?.operations.find(op => op.operation === operation)?.stages.map(s => (
                            <Button key={s.stage} sx={{ textTransform: 'none' }} fullWidth variant='contained' color={s.stage === stage ? 'primary' : 'secondary'} onClick={() => setStage(s.stage)}>{s.stage}</Button>
                        ))}
                    </div>
                </div>


                <div className='w-full flex flex-row flex-wrap gap-4 justify-center'>
                    {data.find(g => g.year === year)?.operations.find(op => op.operation === operation)?.stages.find(s => s.stage === stage)?.media.map(img => (
                        <Image
                            key={img}
                            className='h-[200px] w-auto object-contain rounded-sm cursor-pointer'
                            src={`${process.env.NEXT_PUBLIC_BASEURL}/api/gallery/fetch?stage=${stage}&operation=${operation}&year=${year}&img=${img}`}
                            alt={img}
                            width={200}
                            height={200}
                            // quality={75}
                            loading='lazy'
                            onClick={() => setOpenImg(`/api/gallery/fetch?stage=${encodeURIComponent(stage)}&operation=${encodeURIComponent(operation)}&year=${encodeURIComponent(year)}&img=${encodeURIComponent(img)}`)}
                        />
                    ))}
                </div>


                {openImg ?
                    (
                        <div className='fixed top-0 w-full h-full bg-[rgba(0,0,0,0.5)] p-5 md:p-20 flex justify-center' onClick={(e) => e.target === e.currentTarget ? setOpenImg('') : null}>
                            <div className='h-full w-full md:w-[80%] p-5 md:p-10 flex flex-col justify-center' style={{ border: '1px solid red', backdropFilter: 'blur(5px)', background: 'rgba(0,0,0,0.5)' }}>

                                <div className='absolute top-5 right-5 flex gap-5'>
                                    <Button variant='contained' color='info' onClick={() => {
                                        navigator.clipboard.writeText(process.env.NEXT_PUBLIC_BASEURL + openImg)
                                        alert('Image copied to clipboard!')
                                    }}><Reply /></Button>
                                    <Button variant='contained' onClick={() => setOpenImg('')}><Close /></Button>
                                </div>

                                <div className='relative h-[90%]'>
                                    <Image
                                        key={openImg}
                                        className='m-auto object-contain rounded-sm'
                                        src={process.env.NEXT_PUBLIC_BASEURL + openImg}
                                        alt={openImg}
                                        quality={100}
                                        loading='lazy'
                                        fill
                                    />
                                </div>
                            </div>
                        </div>
                    )
                    : null
                }
            </div>
        </div>
    )
}
