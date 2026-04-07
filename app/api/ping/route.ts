export const runtime = 'edge'

export async function GET() {
    return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store' },
    })
}
