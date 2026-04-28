import { Typography } from '@mui/material'
import { Construction } from '@mui/icons-material'

export default function PlaceholderPanel({
    title,
    description,
}: {
    title: string
    description?: string
}) {
    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1000px]'>
            <div
                className='flex flex-col px-5 py-4'
                style={{
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Member Portal
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    {title}
                </Typography>
            </div>

            <div
                className='flex flex-col items-center justify-center gap-4 p-12'
                style={{
                    border: '1px solid rgba(219,0,29,0.22)',
                    background: 'rgba(255,255,255,0.01)',
                    minHeight: 220,
                }}
            >
                <Construction sx={{ fontSize: 40, color: 'var(--red)', opacity: 0.4 }} />
                <Typography
                    fontWeight={700}
                    fontSize='0.72rem'
                    letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}
                >
                    Under Construction
                </Typography>
                {description && (
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.25)', textAlign: 'center', maxWidth: 360 }}>
                        {description}
                    </Typography>
                )}
            </div>
        </div>
    )
}
