'use client'

import { useState } from 'react'
import {
    TextField, Button, CircularProgress, Alert,
    Select, MenuItem, FormControl, InputLabel,
} from '@mui/material'
import { PersonAdd, CheckCircle } from '@mui/icons-material'
import { Typography } from '@mui/material'

const REGIONS = ['Oceania', 'North America', 'Europe', 'Asia', 'Other']
const NIGHTS  = ['Saturday', 'Sunday', 'Both', 'Flexible']
const PRIMARY_ROLES = [
    'Infantry', 'Section Medic', 'Advanced Medic',
    'Rotary Aviation', 'Fixed Wing Aviation', 'Armored Crew',
    'Machine Gunner', 'Medium Anti-Tank', 'Engineer',
    'Logistics', 'Indirect Fire', 'Heavy Weapons',
]

interface RecruitMemberTabProps {
    displayName: string
}

export default function RecruitMemberTab({ displayName }: RecruitMemberTabProps) {
    const [fields, setFields] = useState({
        discordUsername: '',
        inGameName: '',
        recruiter: displayName,
        steamUrl: '',
        region: '',
        armaHours: '',
        availableNights: '',
        primaryRole: '',
        notes: '',
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFields(prev => ({ ...prev, [key]: e.target.value }))

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/j1/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...fields, isDirectRecruit: true }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || 'Something went wrong.')
            } else {
                setSuccess(true)
                setFields({
                    discordUsername: '', inGameName: '', recruiter: displayName,
                    steamUrl: '', region: '', armaHours: '',
                    availableNights: '', primaryRole: '', notes: '',
                })
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            fontSize: '0.85rem',
            '& fieldset': { borderColor: 'rgba(219,0,29,0.2)' },
            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.85rem' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
        '& .MuiSelect-select': { fontSize: '0.85rem' },
    }

    const sectionLabel = (text: string) => (
        <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginTop: 4, marginBottom: 2 }}>
            {text}
        </Typography>
    )

    return (
        <div className='flex flex-col gap-4 p-5 max-w-[680px]'>
            <div>
                <Typography style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>
                    Direct Recruitment
                </Typography>
                <Typography style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>
                    Use this form to log a member who was directly recruited without going through the public application form. A record will be created in the Applications Register with &quot;Accepted&quot; status.
                </Typography>
            </div>

            {success && (
                <div
                    className='flex items-center gap-3 px-4 py-3'
                    style={{ border: '1px solid rgba(0,195,100,0.2)', borderLeft: '2px solid #00c364', background: 'rgba(0,195,100,0.04)' }}
                >
                    <CheckCircle style={{ fontSize: 18, color: '#00c364', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)' }}>
                        Recruit logged successfully. The record is now visible in the Applications tab.
                    </span>
                </div>
            )}

            <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
                {/* ── Identity ── */}
                {sectionLabel('Identity')}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <TextField
                        label='Discord Username'
                        placeholder="Recruit's Discord handle"
                        value={fields.discordUsername}
                        onChange={set('discordUsername')}
                        required
                        fullWidth
                        sx={inputSx}
                    />
                    <TextField
                        label='In-Game Name'
                        placeholder="Recruit's in-game name"
                        value={fields.inGameName}
                        onChange={set('inGameName')}
                        required
                        fullWidth
                        sx={inputSx}
                    />
                </div>
                <TextField
                    label='Steam Profile URL (optional)'
                    placeholder='https://steamcommunity.com/id/...'
                    value={fields.steamUrl}
                    onChange={set('steamUrl')}
                    fullWidth
                    sx={inputSx}
                />

                {/* ── Background ── */}
                {sectionLabel('Background')}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <FormControl sx={inputSx}>
                        <InputLabel>Region</InputLabel>
                        <Select
                            value={fields.region}
                            label='Region'
                            onChange={e => setFields(prev => ({ ...prev, region: e.target.value }))}
                        >
                            {REGIONS.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <TextField
                        label='ARMA 3 Hours (optional)'
                        placeholder='e.g. 500'
                        value={fields.armaHours}
                        onChange={set('armaHours')}
                        sx={inputSx}
                    />
                    <FormControl sx={inputSx}>
                        <InputLabel>Available nights</InputLabel>
                        <Select
                            value={fields.availableNights}
                            label='Available nights'
                            onChange={e => setFields(prev => ({ ...prev, availableNights: e.target.value }))}
                        >
                            {NIGHTS.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                        </Select>
                    </FormControl>
                </div>
                <FormControl sx={inputSx}>
                    <InputLabel>Primary role</InputLabel>
                    <Select
                        value={fields.primaryRole}
                        label='Primary role'
                        onChange={e => setFields(prev => ({ ...prev, primaryRole: e.target.value }))}
                    >
                        {PRIMARY_ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </Select>
                </FormControl>

                {/* ── Admin ── */}
                {sectionLabel('Admin')}
                <TextField
                    label='Recruited By'
                    value={fields.recruiter}
                    onChange={set('recruiter')}
                    required
                    fullWidth
                    sx={inputSx}
                />
                <TextField
                    label='Notes (optional)'
                    placeholder='Any relevant notes about this recruit...'
                    value={fields.notes}
                    onChange={set('notes')}
                    multiline
                    minRows={3}
                    fullWidth
                    inputProps={{ maxLength: 1000 }}
                    sx={inputSx}
                />

                {error && (
                    <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>
                )}

                <Button
                    type='submit'
                    variant='contained'
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={14} color='inherit' /> : <PersonAdd />}
                    sx={{
                        borderRadius: 0,
                        background: 'var(--red)',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        fontSize: '0.78rem',
                        padding: '9px 20px',
                        alignSelf: 'flex-start',
                        '&:hover': { background: 'rgba(219,0,29,0.85)' },
                        '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)' },
                    }}
                >
                    {loading ? 'LOGGING...' : 'LOG RECRUIT'}
                </Button>
            </form>
        </div>
    )
}
