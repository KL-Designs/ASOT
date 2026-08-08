'use client'

import { useEffect } from 'react'

export default function FullscreenPage() {
    useEffect(() => {
        document.body.classList.add('fullscreen-page')
        return () => document.body.classList.remove('fullscreen-page')
    }, [])

    return null
}
