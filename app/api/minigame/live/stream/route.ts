import { type NextRequest } from 'next/server'
import minigameEmitter from '@/lib/minigame/emitter'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        start(controller) {
            const send = (data: unknown) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
            }

            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': heartbeat\n\n'))
                } catch {
                    clearInterval(heartbeat)
                }
            }, 25_000)

            const onUpdate = (players: unknown) => {
                try {
                    send(players)
                } catch {
                    // Connection closed
                }
            }

            minigameEmitter.on('live', onUpdate)

            request.signal.addEventListener('abort', () => {
                clearInterval(heartbeat)
                minigameEmitter.off('live', onUpdate)
                try { controller.close() } catch { /* already closed */ }
            })
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    })
}
