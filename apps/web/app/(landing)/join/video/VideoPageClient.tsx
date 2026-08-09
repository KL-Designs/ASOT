'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RecruitVideoPlayer from '@/components/recruit/RecruitVideoPlayer'

export default function VideoPageClient({ videoUrl, startDelay, showInfoPage }: { videoUrl: string; startDelay: number; showInfoPage: boolean }) {
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
        setTimeout(() => router.push(showInfoPage ? '/join/info' : '/join'), 840)
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
            <div style={{ width: '100%', maxWidth: 'min(1600px, calc((100dvh - 160px) * 1.7778))' }}>
                <RecruitVideoPlayer
                    videoUrl={videoUrl}
                    startDelay={startDelay}
                    onContinue={handleContinue}
                />
            </div>
        </div>
    )
}
