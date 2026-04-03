'use client'

import { useState } from 'react'
import { Typography } from '@mui/material'
import ImportPanel from '../ImportPanel'

export default function J4AdminPanel() {
    const [importOpen, setImportOpen] = useState(false)

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1000px]'>

            {/* Header */}
            <div
                className='flex flex-col px-5 py-4'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Department
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    J4 — Administration
                </Typography>
            </div>

            {/* Tools */}
            <div>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                    Tools
                </Typography>
                <div className='flex flex-wrap gap-4'>

                    <button
                        onClick={() => setImportOpen(true)}
                        className='flex-1 min-w-[160px] max-w-[220px]'
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                    >
                        <div
                            className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(219,0,29,0.08)]'
                            style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
                        >
                            <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                Import<br />Panel
                            </Typography>
                        </div>
                    </button>

                </div>
            </div>

            <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} />
        </div>
    )
}
