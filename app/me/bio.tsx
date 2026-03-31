'use client'

import { useState, useEffect } from "react"
import { TextField, Typography } from '@mui/material'
import { UploadFile } from "@mui/icons-material"
import Image from 'next/image'



function useBioData() {
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

    const save = (patch: object) => {
        fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        })
    }

    return { id, bio, setBio, save }
}



const cardStyle = {
    border: '1px solid rgba(219,0,29,0.15)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.02)',
}

const headerStyle = {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
}


export function BioSections({ canUploadImage, isHQ }: { canUploadImage?: boolean; isHQ?: boolean }) {
    const { id, bio, setBio, save } = useBioData()

    const upload = async (file: File) => {
        const formData = new FormData()
        formData.append("file", file)
        fetch("/api/uploads/bio", { method: "POST", body: formData })
            .then(res => res.json())
            .then(json => {
                if (json.error) alert(json.error)
                window.location.reload()
            })
    }

    return (
        <div style={cardStyle}>
            <div className='flex items-center px-4 py-3' style={headerStyle}>
                <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase' }}>
                    Bio Settings
                </Typography>
            </div>

            <div className='flex flex-col'>
                {/* Bio */}
                <div className='flex items-start gap-5 px-5 py-4' style={headerStyle}>
                    <TextField
                        fullWidth
                        multiline
                        rows={6}
                        placeholder='Type your bio here...'
                        value={bio || ''}
                        onChange={(e) => setBio(e.currentTarget.value)}
                        onBlur={() => bio !== null && save({ content: bio })}
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
                    {canUploadImage && <div className="hidden sm:flex flex-col justify-between gap-3 h-[152px]">
                        <div
                            className="relative w-full h-full min-w-[140px]"
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
                    </div>}
                </div>
            </div>
        </div>
    )
}
