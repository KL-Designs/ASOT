'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, MarkerType, useReactFlow,
    type Node, type Edge, type NodeProps, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress, Alert, Button,
} from '@mui/material'
import { Close, Search } from '@mui/icons-material'

interface Props {
    open: boolean
    onClose: () => void
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 64

const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

interface RoleNodeData extends Record<string, unknown> {
    role: OrbatRole
    dimmed: boolean
}

type RoleFlowNode = Node<RoleNodeData, 'roleNode'>

function RoleNode({ data }: NodeProps<RoleFlowNode>) {
    const { role, dimmed } = data
    return (
        <div style={{
            width: NODE_WIDTH, minHeight: NODE_HEIGHT, padding: '8px 12px',
            background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(219,0,29,0.4)', borderTop: '2px solid var(--red)',
            opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.15s',
        }}>
            <Handle type='target' position={Position.Top} style={{ background: 'rgba(219,0,29,0.6)' }} />
            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.9)', fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>
                {role.name}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.5)' }}>
                    {role.permissions.length} perm{role.permissions.length === 1 ? '' : 's'}
                </span>
                <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.5)' }}>
                    {role.discordRoleIds.length} discord role{role.discordRoleIds.length === 1 ? '' : 's'}
                </span>
            </div>
            <Handle type='source' position={Position.Bottom} style={{ background: 'rgba(219,0,29,0.6)' }} />
        </div>
    )
}

const nodeTypes = { roleNode: RoleNode }

function layoutRoles(roles: OrbatRole[], search: string): { nodes: RoleFlowNode[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const role of roles) {
        g.setNode(String(role._id), { width: NODE_WIDTH, height: NODE_HEIGHT })
    }
    for (const role of roles) {
        if (role.parentRoleId) g.setEdge(String(role.parentRoleId), String(role._id))
    }

    dagre.layout(g)

    const term = search.trim().toLowerCase()
    const nodes: RoleFlowNode[] = roles.map(role => {
        const pos = g.node(String(role._id))
        const dimmed = term.length > 0 && !role.name.toLowerCase().includes(term)
        return {
            id: String(role._id),
            type: 'roleNode',
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
            data: { role, dimmed },
        }
    })

    const edges: Edge[] = roles
        .filter(role => role.parentRoleId)
        .map(role => ({
            id: `${role.parentRoleId}-${role._id}`,
            source: String(role.parentRoleId),
            target: String(role._id),
            markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(219,0,29,0.6)' },
            style: { stroke: 'rgba(219,0,29,0.5)' },
        }))

    return { nodes, edges }
}

function Canvas({ roles, search, error, onConnectRoles, onSelectRole }: {
    roles: OrbatRole[]
    search: string
    error: string | null
    onConnectRoles: (childId: string, parentId: string) => void
    onSelectRole: (role: OrbatRole) => void
}) {
    const { nodes, edges } = useMemo(() => layoutRoles(roles, search), [roles, search])
    const { setCenter, getZoom } = useReactFlow()

    useEffect(() => {
        const term = search.trim().toLowerCase()
        if (!term) return
        const match = nodes.find(n => !n.data.dimmed)
        if (match) setCenter(match.position.x + NODE_WIDTH / 2, match.position.y + NODE_HEIGHT / 2, { zoom: getZoom(), duration: 300 })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search])

    function handleConnect(connection: Connection) {
        if (!connection.source || !connection.target) return
        onConnectRoles(connection.target, connection.source)
    }

    function handleNodeClick(_event: React.MouseEvent, node: RoleFlowNode) {
        onSelectRole(node.data.role)
    }

    return (
        <Box sx={{ flex: 1, position: 'relative' }}>
            {error && (
                <Alert severity='error' sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 10, fontSize: '0.72rem' }}>
                    {error}
                </Alert>
            )}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                fitView
                onConnect={handleConnect}
                onNodeClick={handleNodeClick}
                colorMode='dark'
            >
                <Background color='rgba(255,255,255,0.08)' />
                <Controls showInteractive={false} />
            </ReactFlow>
        </Box>
    )
}

export default function ChainOfCommandPanel({ open, onClose }: Props) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [selectedRole, setSelectedRole] = useState<OrbatRole | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const res = await fetch('/api/admin/orbat/roles')
        const data = await res.json().catch(() => ({}))
        setRoles(data.roles ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { if (open) load() }, [open, load])
    useEffect(() => { if (!open) { setSearch(''); setSelectedRole(null); setError(null) } }, [open])

    async function patchParent(childId: string, parentRoleId: string | null) {
        setError(null)
        try {
            const res = await fetch(`/api/admin/orbat/roles/${childId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentRoleId }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data.error ?? 'Failed to update chain of command')
            }
        } catch {
            setError('Network error — could not update chain of command')
        } finally {
            await load()
        }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    height: '85vh',
                    width: '90vw',
                    maxWidth: 2000,
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                        ORBAT Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Chain of Command
                    </Typography>
                </div>
                <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1 }}>
                {loading && roles.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <CircularProgress size={26} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <Box sx={{ p: 1.5 }}>
                                <TextField
                                    size='small' placeholder='Search roles…' value={search} onChange={e => setSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={searchFieldSx}
                                />
                            </Box>
                            <ReactFlowProvider>
                                <Canvas
                                    roles={roles}
                                    search={search}
                                    error={error}
                                    onConnectRoles={(childId, parentId) => patchParent(childId, parentId)}
                                    onSelectRole={setSelectedRole}
                                />
                            </ReactFlowProvider>
                        </Box>

                        {selectedRole && (
                            <Box sx={{ width: 280, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', p: 2, overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>{selectedRole.name}</Typography>
                                    <IconButton size='small' onClick={() => setSelectedRole(null)}>
                                        <Close sx={{ fontSize: 14, color: 'rgba(237,237,237,0.4)' }} />
                                    </IconButton>
                                </div>
                                {selectedRole.parentRoleId && (
                                    <Button
                                        size='small' variant='outlined' fullWidth
                                        onClick={() => { patchParent(String(selectedRole._id), null); setSelectedRole(null) }}
                                        sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)', mb: 2 }}
                                    >
                                        Detach from Parent
                                    </Button>
                                )}
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>
                                    Permissions ({selectedRole.permissions.length})
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    {selectedRole.permissions.length === 0
                                        ? <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>None granted</span>
                                        : selectedRole.permissions.map(p => (
                                            <div key={p} style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.6)', marginBottom: 2 }}>{p}</div>
                                        ))}
                                </div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>
                                    Discord roles ({selectedRole.discordRoleIds.length})
                                </div>
                                <div>
                                    {selectedRole.discordRoleIds.length === 0
                                        ? <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>None granted</span>
                                        : <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)' }}>{selectedRole.discordRoleIds.length} role(s) — edit in Roles Manager to see names</span>}
                                </div>
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
