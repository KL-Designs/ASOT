'use client'

import { useState, useRef } from 'react'
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, CircularProgress, Checkbox,
    FormControlLabel, Alert, Divider, Box,
} from '@mui/material'
import { CloudUpload, CheckCircle, Error as ErrorIcon } from '@mui/icons-material'

interface Props {
    open: boolean
    onClose: () => void
}

type Step = 'upload' | 'confirm' | 'loading' | 'result'

interface ImportResult {
    orbatInserted: number
    orbatMatched: number
    mastersheetRows: number
    mastersheetMatched: number
    usersUpdated: number
    namesUpdated: number
}

export default function MassImportModal({ open, onClose }: Props) {
    const [step, setStep]               = useState<Step>('upload')
    const [orbatFile, setOrbatFile]     = useState<File | null>(null)
    const [sheetFile, setSheetFile]     = useState<File | null>(null)
    const [confirmed, setConfirmed]     = useState(false)
    const [result, setResult]           = useState<ImportResult | null>(null)
    const [error, setError]             = useState<string | null>(null)

    const orbatRef = useRef<HTMLInputElement>(null)
    const sheetRef = useRef<HTMLInputElement>(null)

    const reset = () => {
        setStep('upload')
        setOrbatFile(null)
        setSheetFile(null)
        setConfirmed(false)
        setResult(null)
        setError(null)
    }

    const handleClose = () => {
        if (step === 'loading') return
        reset()
        onClose()
    }

    const handleImport = async () => {
        if (!orbatFile || !sheetFile) return
        setStep('loading')
        setError(null)
        try {
            const formData = new FormData()
            formData.append('orbat', orbatFile)
            formData.append('mastersheet', sheetFile)

            const res = await fetch('/api/admin/mass-import', { method: 'POST', body: formData })
            const data = await res.json()

            if (!res.ok) {
                setError(data.error ?? `Server error ${res.status}`)
                setStep('result')
                return
            }
            setResult(data)
            setStep('result')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error')
            setStep('result')
        }
    }

    const fileLabel = (file: File | null, placeholder: string) =>
        file ? file.name : placeholder

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth='sm'
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                },
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                    J4 Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                    Mass Import
                </Typography>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ pt: 3 }}>

                {/* ── Step: Upload ── */}
                {step === 'upload' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                            Upload the Orbat CSV and Billet Mastersheet CSV to perform a full import.
                            This will wipe all existing ORBAT positions and milpac records.
                        </Typography>

                        {/* Orbat file */}
                        <Box>
                            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', mb: 1 }}>
                                Orbat CSV
                            </Typography>
                            <input
                                ref={orbatRef}
                                type='file'
                                accept='.csv'
                                style={{ display: 'none' }}
                                onChange={e => setOrbatFile(e.target.files?.[0] ?? null)}
                            />
                            <Button
                                variant='outlined'
                                startIcon={<CloudUpload />}
                                onClick={() => orbatRef.current?.click()}
                                fullWidth
                                sx={{
                                    borderColor: orbatFile ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.15)',
                                    color: orbatFile ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
                                    justifyContent: 'flex-start',
                                    textTransform: 'none',
                                    fontSize: '0.78rem',
                                    letterSpacing: '0.02em',
                                }}
                            >
                                {fileLabel(orbatFile, 'Choose Orbat.csv…')}
                            </Button>
                        </Box>

                        {/* Mastersheet file */}
                        <Box>
                            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', mb: 1 }}>
                                Billet Mastersheet CSV
                            </Typography>
                            <input
                                ref={sheetRef}
                                type='file'
                                accept='.csv'
                                style={{ display: 'none' }}
                                onChange={e => setSheetFile(e.target.files?.[0] ?? null)}
                            />
                            <Button
                                variant='outlined'
                                startIcon={<CloudUpload />}
                                onClick={() => sheetRef.current?.click()}
                                fullWidth
                                sx={{
                                    borderColor: sheetFile ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.15)',
                                    color: sheetFile ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
                                    justifyContent: 'flex-start',
                                    textTransform: 'none',
                                    fontSize: '0.78rem',
                                    letterSpacing: '0.02em',
                                }}
                            >
                                {fileLabel(sheetFile, 'Choose Billet Mastersheet.csv…')}
                            </Button>
                        </Box>
                    </Box>
                )}

                {/* ── Step: Confirm ── */}
                {step === 'confirm' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Alert
                            severity='warning'
                            sx={{
                                background: 'rgba(219,0,29,0.08)',
                                border: '1px solid rgba(219,0,29,0.42)',
                                color: 'rgba(237,237,237,0.85)',
                                fontSize: '0.78rem',
                                '& .MuiAlert-icon': { color: 'rgba(219,0,29,0.8)' },
                            }}
                        >
                            This will <strong>permanently wipe</strong> all ORBAT positions and milpac records
                            (ranks, awards, qualifications, points) and replace them with the imported data.
                            This action cannot be undone.
                        </Alert>

                        <Box sx={{ pl: 1 }}>
                            <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.5)', mb: 0.5 }}>Files to import:</Typography>
                            <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>Orbat: <strong>{orbatFile?.name}</strong></Typography>
                            <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>Mastersheet: <strong>{sheetFile?.name}</strong></Typography>
                        </Box>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={confirmed}
                                    onChange={e => setConfirmed(e.target.checked)}
                                    sx={{ color: 'rgba(219,0,29,0.6)', '&.Mui-checked': { color: 'var(--red)' } }}
                                />
                            }
                            label={
                                <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>
                                    I understand this will overwrite all existing milpac and ORBAT data
                                </Typography>
                            }
                        />
                    </Box>
                )}

                {/* ── Step: Loading ── */}
                {step === 'loading' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
                        <CircularProgress sx={{ color: 'var(--red)' }} />
                        <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                            Importing data, please wait…
                        </Typography>
                    </Box>
                )}

                {/* ── Step: Result ── */}
                {step === 'result' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {error ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <ErrorIcon sx={{ color: 'var(--red)' }} />
                                <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>
                                    Import failed: {error}
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <CheckCircle sx={{ color: '#4caf50' }} />
                                    <Typography fontWeight={700} fontSize='0.85rem' sx={{ textTransform: 'uppercase', letterSpacing: 2 }}>
                                        Import Complete
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pl: 0.5 }}>
                                    {[
                                        ['ORBAT positions inserted', result?.orbatInserted],
                                        ['ORBAT users matched',      result?.orbatMatched],
                                        ['Mastersheet rows parsed',  result?.mastersheetRows],
                                        ['Mastersheet users matched',result?.mastersheetMatched],
                                        ['Milpac records updated',   result?.usersUpdated],
                                        ['Names updated',            result?.namesUpdated],
                                    ].map(([label, value]) => (
                                        <Box key={label as string} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)', letterSpacing: '0.03em' }}>{label}</Typography>
                                            <Typography fontSize='0.72rem' fontWeight={700} sx={{ color: 'rgba(237,237,237,0.8)' }}>{value}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </>
                        )}
                    </Box>
                )}

            </DialogContent>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
                {step === 'upload' && (
                    <>
                        <Button onClick={handleClose} size='small' sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem', letterSpacing: 2, textTransform: 'uppercase' }}>
                            Cancel
                        </Button>
                        <Button
                            variant='contained'
                            disabled={!orbatFile || !sheetFile}
                            onClick={() => setStep('confirm')}
                            size='small'
                            sx={{ background: 'var(--red)', fontSize: '0.72rem', letterSpacing: 2, textTransform: 'uppercase', '&:hover': { background: 'rgba(219,0,29,0.8)' } }}
                        >
                            Next
                        </Button>
                    </>
                )}

                {step === 'confirm' && (
                    <>
                        <Button onClick={() => setStep('upload')} size='small' sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem', letterSpacing: 2, textTransform: 'uppercase' }}>
                            Back
                        </Button>
                        <Button
                            variant='contained'
                            disabled={!confirmed}
                            onClick={handleImport}
                            size='small'
                            sx={{ background: 'var(--red)', fontSize: '0.72rem', letterSpacing: 2, textTransform: 'uppercase', '&:hover': { background: 'rgba(219,0,29,0.8)' } }}
                        >
                            Import
                        </Button>
                    </>
                )}

                {step === 'result' && (
                    <Button
                        onClick={handleClose}
                        size='small'
                        sx={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem', letterSpacing: 2, textTransform: 'uppercase' }}
                    >
                        Close
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}
