'use client'

import Link from 'next/link'
import { useEffect, useState } from "react"

import { Button, Typography, Divider, Switch } from '@mui/material'
import { ChevronRight, Launch } from '@mui/icons-material'


export default function Page() {

    const [agreement, setAgreement] = useState(false)
    const [waitTime, setWaitTime] = useState(10)

    const [qolList, setQolList] = useState<{ id: string, name: string }[]>([])
    const [gfxList, setGfxList] = useState<{ id: string, name: string }[]>([])
    const [zeusList, setZeusList] = useState<{ id: string, name: string }[]>([])
    const [j2List, setJ2List] = useState<{ id: string, name: string }[]>([])
    const [j5List, setJ5List] = useState<{ id: string, name: string }[]>([])

    useEffect(() => {
        const interval = setInterval(() => {
            setWaitTime(prev => {
                if (prev <= 0) {
                    clearInterval(interval)
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        if (!agreement) return

        fetch('/optionals/fetch?type=qol')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                setQolList(json)
            })

        fetch('/optionals/fetch?type=gfx')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                setGfxList(json)
            })

        fetch('/optionals/fetch?type=zeus')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                setZeusList(json)
            })

        fetch('/optionals/fetch?type=j2')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                setJ2List(json)
            })

        fetch('/optionals/fetch?type=j5')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                setJ5List(json)
            })
    }, [agreement])


    function Mod({ type, details }: { type: 'qol' | 'gfx' | 'zeus' | 'j2' | 'j5', details: { id: string, name: string } }) {
        const [enabled, setEnabled] = useState<boolean | null>(null)

        useEffect(() => {
            fetch(`/optionals/me?type=${type}&id=${details.id}&mode=check`)
                .then(res => res.json())
                .then(json => {
                    if (json.error) return console.error(json.error)
                    if (json.enabled) setEnabled(true)
                    else setEnabled(false)
                })
        }, [])

        useEffect(() => {
            if (enabled === null) return
            if (enabled) fetch(`/optionals/me?type=${type}&id=${details.id}&mode=add&name=${encodeURIComponent(details.name)}`)
                .then(res => res.json())
                .then(json => {
                    if (json.error) return console.error(json.error)
                })

            else fetch(`/optionals/me?type=${type}&id=${details.id}&mode=remove`)
                .then(res => res.json())
                .then(json => {
                    if (json.error) return console.error(json.error)
                })
        }, [enabled])

        return (
            <div className="flex flex-row justify-between items-center" style={{ borderBottom: '1px solid var(--grey)' }}>
                <Link href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${details.id}`} target='_blank'><Typography fontWeight={enabled ? 600 : 400} align='left'>{details.name} <Launch fontSize='small' sx={{ opacity: 0.3 }} /></Typography></Link>
                <Switch checked={enabled || false} onChange={(e) => { setEnabled(e.currentTarget.checked) }} />
            </div>
        )
    }


    return (
        <div>
            <div style={{ display: agreement ? 'none' : 'flex' }} className='flex-col justify-center max-w-[600px] h-full gap-4'>
                <Typography className='animate-pulse' fontWeight={700} fontSize={50} letterSpacing={4} align='center' color='red'>WARNING</Typography>
                <Divider />
                <Typography fontWeight={300} fontSize={20} align='center'>
                    Optional mods are provided for customization, but enabling too many can significantly degrade game performance and stability.<br /><br />
                    The more mods you activate, the higher the risk of reduced FPS, long load times, and potential game crashes.<br /><br />
                    Only enable mods you understand and actually intend to use.
                </Typography>
                <Divider />
                <Button onClick={() => setAgreement(true)} disabled={waitTime > 0}>
                    Continue{waitTime !== 0 ? ` (${waitTime})` : ''}
                </Button>

            </div>

            <div style={{ display: agreement ? 'flex' : 'none' }} className="flex-col gap-5 xl:w-[1300px]">
                <div className="mb-5 flex flex-row justify-between">
                    <div>
                        <Typography fontWeight={700} fontSize={50} letterSpacing={4} align='left'>CONFIGURE OPTIONAL ADDONS</Typography>
                        <Typography fontWeight={300} fontSize={20} align='left'>Some addons have a big effect on performance.<br />For the best experience, only enable addons you know and use regularly.</Typography>

                        <br />

                        <div className='flex gap-5'>
                            <Button className='animate-pulse' variant="outlined" color="success" size="large" sx={{ fontSize: '14pt' }}>All Changes are Saved Automatically</Button>
                            <Button variant="outlined" color="primary" size="large" sx={{ fontSize: '14pt' }} onClick={() => {
                                fetch('/optionals/reset')
                                    .then(res => res.json())
                                    .then(json => {
                                        if (json.error) alert(json.error)
                                        if (json.success) alert('All optionals have been disabled, this page will now reload.'), location.reload()
                                    })
                            }}>DISABLE ALL OPTIONALS</Button>
                        </div>
                    </div>

                    {/* <div>
                        <Typography fontWeight={300} fontSize={20} letterSpacing={4} align='right'>KNOWN FPS HITS</Typography>
                        <Divider />
                        <Typography fontWeight={200} fontSize={20} letterSpacing={4} align='right'>Athena -</Typography>
                        <Typography fontWeight={200} fontSize={20} letterSpacing={4} align='right'>Blastcore -</Typography>
                        <Typography fontWeight={200} fontSize={20} letterSpacing={4} align='right'>Bloodlust+ -</Typography>
                        <Typography fontWeight={200} fontSize={20} letterSpacing={4} align='right'>Enhanced Missile Smoke -</Typography>
                        <Typography fontWeight={200} fontSize={20} letterSpacing={4} align='right'>Depressed Lighting -</Typography>
                        <Typography fontWeight={200} fontSize={20} letterSpacing={4} align='right'>A3 Thermal Improvement -</Typography>
                    </div> */}
                </div>

                <div className="flex flex-row gap-5 flex-wrap justify-center">
                    <div className="rounded-md p-3 flex-grow" style={{ border: '1px solid var(--red)' }}>
                        <div className="flex flex-row justify-between">
                            <Typography fontWeight={700} fontSize={30} align='left'>Quality of Life</Typography>
                            {/* <Switch checked={qolAll} onChange={(e) => setQolAll(e.currentTarget.checked)} /> */}
                        </div>

                        <Divider className="my-3" />

                        <div>
                            {qolList.map(mod => <Mod key={mod.id} type="qol" details={mod} />)}
                        </div>
                    </div>

                    <div className="rounded-md p-3 flex-grow" style={{ border: '1px solid var(--red)' }}>
                        <div className="flex flex-row justify-between">
                            <Typography fontWeight={700} fontSize={30} align='left'>FPS-Intensive Mods</Typography>
                            {/* <Switch checked={false} onChange={(e) => { }} /> */}
                        </div>

                        <Typography fontWeight={400} fontSize={15} align='left'>Some of these addons may <b className='text-red-500'>significantly</b> effect your performance.</Typography>

                        <Divider className="my-3" />

                        <div>
                            {gfxList.map(mod => <Mod key={mod.id} type="gfx" details={mod} />)}
                        </div>
                    </div>
                </div>

                <br />

                <Typography fontWeight={700} fontSize={50} letterSpacing={4} align='left'>DEPARTMENT ADDONS</Typography>

                <div className="flex flex-row gap-5 flex-wrap justify-center">
                    <div className="rounded-md p-3 flex-grow" style={{ border: '1px solid var(--red)' }}>
                        <div className="flex flex-row justify-between">
                            <Typography fontWeight={700} fontSize={30} align='left'>J2 Mission Making</Typography>
                            {/* <Switch checked={false} onChange={(e) => { }} /> */}
                        </div>

                        <Divider className="my-3" />

                        <div>
                            {j2List.map(mod => <Mod key={mod.id} type="j2" details={mod} />)}
                        </div>
                    </div>

                    <div className="rounded-md p-3 flex-grow" style={{ border: '1px solid var(--red)' }}>
                        <div className="flex flex-row justify-between">
                            <Typography fontWeight={700} fontSize={30} align='left'>J5 Media</Typography>
                            {/* <Switch checked={false} onChange={(e) => { }} /> */}
                        </div>

                        <Divider className="my-3" />

                        <div>
                            {j5List.map(mod => <Mod key={mod.id} type="j5" details={mod} />)}
                        </div>
                    </div>

                    <div className="rounded-md p-3 flex-grow" style={{ border: '1px solid var(--red)' }}>
                        <div className="flex flex-row justify-between">
                            <Typography fontWeight={700} fontSize={30} align='left'>J6 Zeus</Typography>
                            {/* <Switch checked={false} onChange={(e) => { }} /> */}
                        </div>

                        <Divider className="my-3" />

                        <div>
                            {zeusList.map(mod => <Mod key={mod.id} type="zeus" details={mod} />)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}