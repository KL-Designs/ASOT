/**
 * Uploading a batch, with a bar per item.
 *
 * `XMLHttpRequest` and not `fetch`, and this is not nostalgia: fetch has no
 * upload-progress event at all, so a bar built on it can only ever show
 * "started" and "finished". A member sending a 400MB clip over a domestic
 * connection needs to see it moving.
 *
 * Two at a time. One is needlessly slow on twenty small screenshots; more than
 * two competes with itself for the same upstream bandwidth and makes every
 * individual bar crawl, which reads as broken even though the total is the
 * same.
 *
 * The orchestration is kept apart from the XHR so the state machine — which is
 * where the bugs live — can be tested without a network.
 */

export type UploadPhase = 'queued' | 'uploading' | 'processing' | 'failed'

export type UploadState = { phase: UploadPhase, progress: number, error?: string }

export type UploadJob = { localId: string, body: FormData | { json: unknown } }

export type SendFn = (
    job: UploadJob,
    onProgress: (fraction: number) => void,
) => Promise<{ id: string }>

export async function runUploads(opts: {
    jobs: UploadJob[]
    concurrency: number
    send: SendFn
    onChange: (localId: string, state: UploadState) => void
}): Promise<{ uploaded: string[], failed: string[] }> {
    const { jobs, concurrency, send, onChange } = opts
    const uploaded: string[] = []
    const failed: string[] = []

    const queue = [...jobs]

    async function worker() {
        for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
            onChange(job.localId, { phase: 'uploading', progress: 0 })
            try {
                const { id } = await send(job, fraction => {
                    onChange(job!.localId, { phase: 'uploading', progress: fraction })
                })
                uploaded.push(id)
                // The bytes have landed; the server is now transcoding. The
                // monitor polls the status route from here.
                onChange(job.localId, { phase: 'processing', progress: 1 })
            } catch (err) {
                failed.push(job.localId)
                onChange(job.localId, {
                    phase: 'failed',
                    progress: 0,
                    error: err instanceof Error ? err.message : 'Upload failed.',
                })
            }
        }
    }

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
    return { uploaded, failed }
}

/** The real sender. Separated from `runUploads` so the orchestration above can
 *  be exercised without a network. */
export const sendOverXhr: SendFn = (job, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/gallery/submissions')

    // The only reason this is not fetch.
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total) }

    xhr.onload = () => {
        let parsed: { id?: string, error?: string } = {}
        try { parsed = JSON.parse(xhr.responseText) } catch { /* handled below */ }
        if (xhr.status >= 200 && xhr.status < 300 && parsed.id) resolve({ id: parsed.id })
        else reject(new Error(parsed.error ?? `Upload failed (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))

    if (job.body instanceof FormData) {
        xhr.send(job.body)
    } else {
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.send(JSON.stringify(job.body.json))
    }
})
