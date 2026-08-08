'use client'

import { useState } from 'react'
import { Box, Typography, Tabs, Tab } from '@mui/material'
import TrainingImportTab from '@/app/dashboard/j3/tabs/TrainingImportTab'
import TrainingGuideImportTab from './TrainingGuideImportTab'

const SUB_TABS = ['Training Records', 'Training Guides']

export default function J3ImportTab() {
    const [sub, setSub] = useState(0)

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Box sx={{ px: { xs: 3, md: 5 }, pt: 3, pb: 1 }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', mb: 0.5 }}>
                    J3 — Training
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={2} sx={{ textTransform: 'uppercase' }}>
                    Training Import
                </Typography>
            </Box>

            {/* Sub-tabs */}
            <Box sx={{ px: { xs: 3, md: 5 }, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Tabs
                    value={sub}
                    onChange={(_, v) => setSub(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 38 }}
                >
                    {SUB_TABS.map((label, i) => (
                        <Tab
                            key={i}
                            label={label}
                            sx={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                minHeight: 38,
                                padding: '6px 16px',
                                textTransform: 'uppercase',
                                color: 'rgba(237,237,237,0.4)',
                                '&.Mui-selected': { color: 'var(--foreground)' },
                            }}
                        />
                    ))}
                </Tabs>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {sub === 0 && <TrainingImportTab />}
                {sub === 1 && <TrainingGuideImportTab />}
            </Box>
        </Box>
    )
}
