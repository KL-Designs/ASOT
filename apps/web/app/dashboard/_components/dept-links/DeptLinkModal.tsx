'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, IconButton, Alert, FormControlLabel, Switch } from '@mui/material'
import { Close } from '@mui/icons-material'

interface Props {
    open: boolean
    onClose: () => void
    department: string
    link: DepartmentLinkListItem | null   // null = create mode
    onSaved: () => void | Promise<void>
}

// Modelled on BoardCardModal.tsx. The client half of the FR-03 contract:
// editing only submits the fields that actually changed, so a nameOverride
// edit never sends url and vice versa; the server enforces the other half
// of that isolation independently.
export default function DeptLinkModal({ open, onClose, department, link, onSaved }: Props) {
    const [urlInput, setUrlInput] = useState('')
    const [overrideInput, setOverrideInput] = useState('')
    const [restricted, setRestricted] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setUrlInput(link?.url ?? '')
        setOverrideInput(link?.nameOverride ?? '')
        setRestricted(link?.restricted ?? false)
        setError(null)
    }, [open, link])

    async function handleSave() {
        setSaving(true)
        setError(null)

        let res: Response
        if (!link) {
            res = await fetch('/api/admin/dept-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department, url: urlInput, nameOverride: overrideInput, restricted }),
            })
        } else {
            const body: Record<string, unknown> = {}
            if (urlInput !== link.url) body.url = urlInput
            if (overrideInput !== (link.nameOverride ?? '')) body.nameOverride = overrideInput
            if (restricted !== link.restricted) body.restricted = restricted

            res = await fetch(`/api/admin/dept-links/${link._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
        }

        setSaving(false)
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Save failed')
            return
        }
        await onSaved()
        onClose()
    }

    const showStaleHint = !!link && urlInput.trim() !== link.url && overrideInput.trim() !== ''

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth
            PaperProps={{ sx: { background: 'rgba(12,12,16,0.98)', border: '1px solid rgba(219,0,29,0.25)', borderTop: '3px solid var(--red)' } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    {link ? 'Edit Quick Link' : 'New Quick Link'}
                </span>
                <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {error && <Alert severity='error' sx={{ fontSize: '0.72rem' }}>{error}</Alert>}

                <TextField size='small' label='URL' value={urlInput} onChange={e => setUrlInput(e.target.value)} autoFocus fullWidth sx={{ mt: 1 }} />

                <TextField
                    size='small'
                    label='Display name override'
                    value={overrideInput}
                    onChange={e => setOverrideInput(e.target.value)}
                    helperText={`Leave blank to use the site's own title — currently: ${link?.fetchedTitle ?? '(fetched when you save)'}`}
                    inputProps={{ maxLength: 80 }}
                    fullWidth
                />

                {showStaleHint && (
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,179,0,0.75)' }}>
                        URL changed. The display name override stays as-is; clear it to use the new site's own title.
                    </span>
                )}

                <div>
                    <FormControlLabel control={<Switch checked={restricted} onChange={e => setRestricted(e.target.checked)} />} label='Restricted' />
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                        Only members granted this department's restricted-links permission will see it.
                    </div>
                </div>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <Button size='small' onClick={onClose} sx={{ color: 'rgba(237,237,237,0.4)' }}>Cancel</Button>
                <Button size='small' variant='contained' disabled={saving} onClick={handleSave}>
                    {saving ? 'Fetching site info…' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
