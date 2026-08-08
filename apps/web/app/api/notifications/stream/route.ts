import { type NextRequest } from 'next/server'
import client from '@/lib/discord'
import notificationEmitter from '@/lib/notifications/emitter'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return new Response('Unauthorized', { status: 401 })
    }

    const encoder = new TextEncoder()
    const userId = me.id

    const stream = new ReadableStream({
        start(controller) {
            const send = (data: unknown) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
            }

            // Keep connection alive through proxies that close idle streams
            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': heartbeat\n\n'))
                } catch {
                    clearInterval(heartbeat)
                }
            }, 25_000)

            const onNotification = (notification: unknown) => {
                try {
                    send(notification)
                } catch {
                    // Connection closed
                }
            }

            notificationEmitter.on(`user:${userId}`, onNotification)

            request.signal.addEventListener('abort', () => {
                clearInterval(heartbeat)
                notificationEmitter.off(`user:${userId}`, onNotification)
                try { controller.close() } catch { /* already closed */ }
            })
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering if present
        },
    })
}
