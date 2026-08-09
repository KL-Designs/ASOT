declare namespace YT {
    const enum PlayerState {
        UNSTARTED = -1,
        ENDED     = 0,
        PLAYING   = 1,
        PAUSED    = 2,
        BUFFERING = 3,
        CUED      = 5,
    }

    interface PlayerVars {
        autoplay?:       0 | 1
        controls?:       0 | 1 | 2
        disablekb?:      0 | 1
        enablejsapi?:    0 | 1
        fs?:             0 | 1
        iv_load_policy?: 1 | 3
        modestbranding?: 0 | 1
        playsinline?:    0 | 1
        rel?:            0 | 1
        start?:          number
    }

    interface PlayerEvent { target: Player }
    interface OnStateChangeEvent { data: number; target: Player }

    interface PlayerOptions {
        videoId?:   string
        width?:     number | string
        height?:    number | string
        playerVars?: PlayerVars
        events?: {
            onReady?:       (event: PlayerEvent) => void
            onStateChange?: (event: OnStateChangeEvent) => void
            onError?:       (event: { data: number }) => void
        }
    }

    class Player {
        constructor(elementIdOrElement: string | HTMLElement, options?: PlayerOptions)
        playVideo(): void
        pauseVideo(): void
        stopVideo(): void
        seekTo(seconds: number, allowSeekAhead?: boolean): void
        setVolume(volume: number): void
        getVolume(): number
        mute(): void
        unMute(): void
        isMuted(): boolean
        setPlaybackRate(suggestedRate: number): void
        getPlaybackRate(): number
        getAvailablePlaybackRates(): number[]
        getDuration(): number
        getCurrentTime(): number
        getPlayerState(): number
        getIframe(): HTMLIFrameElement
        destroy(): void
    }
}

interface Window {
    onYouTubeIframeAPIReady?: () => void
    YT?: typeof YT & { Player: typeof YT.Player }
}
