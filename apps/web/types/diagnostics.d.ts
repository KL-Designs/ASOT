declare module '@/lib/diagnostics.mjs' {
    export function startEventLoopWatchdog(thresholdMs?: number, checkIntervalMs?: number): void
    export function trackJob<T>(label: string, fn: () => Promise<T>): Promise<T>
    export function registerInFlight(label: string): () => void
}
