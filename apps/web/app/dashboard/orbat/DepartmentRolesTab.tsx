'use client'

import { Box, Typography } from '@mui/material'

export default function DepartmentRolesTab({ onDirtyChange: _onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    return (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>
                Coming soon.
            </Typography>
        </Box>
    )
}
