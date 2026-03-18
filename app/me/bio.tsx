'use client'

import { useState, useEffect } from "react"
import { TextField } from "@mui/material"
import { UploadFile } from "@mui/icons-material"

import Image from 'next/image'



export function Bio() {

    const [id, setId] = useState<string | null>(null)
    const [bio, setBio] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/me')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                const user = json as User
                setId(user.id)
                setBio(user.bio?.content || '')
            })
    }, [])

    useEffect(() => {
        if (bio === null) return

        fetch('/api/me', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: bio
            })
        })
    }, [bio])


    const upload = async (file: File) => {
        const formData = new FormData()
        formData.append("file", file)

        fetch("/api/uploads/bio", {
            method: "POST",
            body: formData,
        })
            .then(res => res.json())
            .then(json => {
                if (json.error) alert(json.error)
                window.location.reload()
            })
    }


    return (
        <div className="flex gap-5">
            <TextField
                fullWidth
                multiline
                rows={6}
                placeholder='Type your bio here...'
                value={bio || ''}
                onChange={(e) => setBio(e.currentTarget.value)}
                sx={{
                    '& .MuiOutlinedInput-root': {
                        borderRadius: 0,
                        fontSize: '0.85rem',
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.3)' },
                        '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.5)', borderWidth: 1 },
                    },
                }}
            />

            <div className="hidden sm:flex flex-col justify-between gap-3">
                <div
                    className="relative w-full h-full min-w-[175px]"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <Image src={`/api/uploads/bio?id=${id}&time=${new Date().getTime()}`} alt="User Bio Image" fill className="object-contain" />
                </div>
                <label
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        background: 'transparent',
                        border: '1px solid rgba(219,0,29,0.3)',
                        color: 'rgba(219,0,29,0.8)',
                        padding: '7px 14px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    <UploadFile style={{ fontSize: 14 }} />
                    Upload JPG
                    <input
                        type="file"
                        hidden
                        onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) upload(file)
                        }}
                    />
                </label>
            </div>
        </div>
    )
}


export function BioInfo() {

    const [name, setName] = useState<string | null>(null)
    const [rank, setRank] = useState<string | null>(null)
    const [callsign, setCallsign] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/me')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                const user = json as User
                setName(user.bio?.name || '')
                setRank(user.bio?.rank || '')
                setCallsign(user.bio?.callsign || '')
            })
    }, [])

    useEffect(() => {
        if (name === null || rank === null) return

        fetch('/api/me', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                rank,
                callsign
            })
        })
    }, [name, rank, callsign])


    const fieldSx = {
        '& .MuiInput-root': {
            fontSize: '0.82rem',
            letterSpacing: '0.03em',
            '&:before': { borderBottomColor: 'rgba(255,255,255,0.1)' },
            '&:hover:before': { borderBottomColor: 'rgba(219,0,29,0.4) !important' },
            '&:after': { borderBottomColor: 'rgba(219,0,29,0.6)' },
        },
        '& .MuiInputLabel-root': {
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(237,237,237,0.3)',
        },
        '& .MuiInputLabel-root.Mui-focused': {
            color: 'rgba(219,0,29,0.7)',
        },
    }

    return (
        <div className='flex flex-col gap-3 justify-center min-w-[140px]'>
            <TextField label='Name' variant='standard' value={name || ''} onChange={(e) => setName(e.currentTarget.value)} sx={fieldSx} />
            <TextField label='Rank' variant='standard' value={rank || ''} onChange={(e) => setRank(e.currentTarget.value)} sx={fieldSx} />
            <TextField label='Callsign' variant='standard' value={callsign || ''} onChange={(e) => setCallsign(e.currentTarget.value)} sx={fieldSx} />
        </div>
    )
}
