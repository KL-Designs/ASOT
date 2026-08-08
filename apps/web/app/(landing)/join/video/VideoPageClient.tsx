'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RecruitVideoPlayer from '@/components/recruit/RecruitVideoPlayer'

export default function VideoPageClient({ videoUrl, startDelay }: { videoUrl: string; startDelay: number }) {
    const router    = useRouter()
    const [visible, setVisible] = useState(false)
    const [fading,  setFading]  = useState(false)

    // Fade in on mount — tiny delay so the browser paints opacity:0 before transitioning
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 20)
        return () => clearTimeout(t)
    }, [])

    const handleContinue = () => {
        setFading(true)
        setTimeout(() => router.push('/join'), 840)
    }

    return (
        <div style={{
            minHeight: '100dvh',
            background: '#000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 20px',
            opacity: (visible && !fading) ? 1 : 0,
            transition: 'opacity 0.8s ease',
        }}>
            <div style={{ width: '100%', maxWidth: 1280 }}>
                <RecruitVideoPlayer
                    videoUrl={videoUrl}
                    startDelay={startDelay}
                    onContinue={handleContinue}
                />
            </div>
        </div>
    )
}
