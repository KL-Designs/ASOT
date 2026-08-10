'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogTitle, DialogContent, Divider, Button, IconButton, Typography } from '@mui/material'
import { AccountTree, Close, FileDownload, FileUpload } from '@mui/icons-material'
import ChainOfCommandPanel from './ChainOfCommandPanel'
import OrbatRolesTab from './OrbatRolesTab'
import DepartmentRolesTab from './DepartmentRolesTab'

interface Props {
    open: boolean
    onClose: () => void
}

const closeButtonSx = { '&:hover': { background: 'rgba(255,255,255,0.08)' } }

const tabButtonSx = (active: boolean) => ({
    fontSize: '0.68rem', letterSpacing: 1, borderRadius: 0,
    borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
    color: active ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.4)',
    px: 2, py: 1, minWidth: 0,
    '&:hover': { background: 'rgba(255,255,255,0.04)', color: 'rgba(237,237,237,0.8)' },
})

export default function RolesManagerPanel({ open, onClose }: Props) {
    const [tab, setTab] = useState<'orbat' | 'department'>('orbat')
    const [chainOpen, setChainOpen] = useState(false)
    // Whichever tab is currently mounted reports its own dirty state up here —
    // the shell owns the Dialog's close button/Escape/backdrop, so it's the
    // one that needs to know whether closing would discard unsaved work.
    const [activeDirty, setActiveDirty] = useState(false)
    // Bumped after a successful import to force both tabs to remount (and
    // therefore refetch) — neither tab exposes an imperative reload method,
    // so a fresh `key` is the simplest way to guarantee stale in-memory
    // state never survives a full-replace import.
    const [reloadKey, setReloadKey] = useState(0)
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => { if (!open) { setTab('orbat'); setActiveDirty(false) } }, [open])

    function confirmDiscardIfDirty(message: string): boolean {
        return !activeDirty || window.confirm(message)
    }

    function handleClose() {
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and close?')) return
        onClose()
    }

    function switchTab(next: 'orbat' | 'department') {
        if (tab === next) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and switch tabs?')) return
        setActiveDirty(false)   // the current tab is about to unmount — its edit is gone either way
        setTab(next)
    }

    function handleExport() {
        const a = document.createElement('a')
        a.href = '/api/admin/orbat/roles-export'
        a.download = ''
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    function handleImportClick() {
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and import?')) return
        fileInputRef.current?.click()
    }

    async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ''   // allow re-selecting the same file next time
        if (!file) return

        if (!window.confirm(
            'This will permanently replace the ENTIRE ORBAT Roles catalog, Role Groups / Chain of Command, and Department Roles catalog with the contents of this file. This cannot be undone. Continue?'
        )) return

        setImporting(true)
        try {
            const text = await file.text()
            const res = await fetch('/api/admin/orbat/roles-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: text,
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                window.alert(data.error ?? 'Import failed')
                return
            }
            window.alert(
                `Import complete — ${data.counts.orbatRoles} ORBAT role(s), ${data.counts.orbatRoleGroups} group(s), ${data.counts.departmentRoles} department role(s).`
            )
            setActiveDirty(false)
            setReloadKey(k => k + 1)
        } catch {
            window.alert('Import failed — could not read or upload the file')
        } finally {
            setImporting(false)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth={false}
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    height: '85vh',
                    width: '90vw',
                    maxWidth: 1800,
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                        ORBAT Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Roles Manager
                    </Typography>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tab === 'orbat' && (
                        <Button size='small' variant='outlined' startIcon={<AccountTree sx={{ fontSize: 15 }} />} onClick={() => setChainOpen(true)}
                            sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)' }}>
                            Chain of Command
                        </Button>
                    )}
                    <Button size='small' variant='outlined' startIcon={<FileDownload sx={{ fontSize: 15 }} />} onClick={handleExport}
                        sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                        Export
                    </Button>
                    <Button size='small' variant='outlined' startIcon={<FileUpload sx={{ fontSize: 15 }} />} onClick={handleImportClick} disabled={importing}
                        sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.75)' }}>
                        {importing ? 'Importing…' : 'Import'}
                    </Button>
                    <input ref={fileInputRef} type='file' accept='.json,application/json' onChange={handleFileSelected} style={{ display: 'none' }} />
                    <IconButton size='small' onClick={handleClose} sx={closeButtonSx}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>
            </DialogTitle>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                <Button disableRipple onClick={() => switchTab('orbat')} sx={tabButtonSx(tab === 'orbat')}>ORBAT Roles</Button>
                <Button disableRipple onClick={() => switchTab('department')} sx={tabButtonSx(tab === 'department')}>Department Roles</Button>
            </div>

            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                {tab === 'orbat'
                    ? <OrbatRolesTab key={`orbat-${reloadKey}`} onDirtyChange={setActiveDirty} />
                    : <DepartmentRolesTab key={`department-${reloadKey}`} onDirtyChange={setActiveDirty} />}
            </DialogContent>

            <ChainOfCommandPanel key={`chain-${reloadKey}`} open={chainOpen} onClose={() => setChainOpen(false)} />
        </Dialog>
    )
}
