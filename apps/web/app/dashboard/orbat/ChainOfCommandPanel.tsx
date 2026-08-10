'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    ReactFlow, ReactFlowProvider, Background, Controls, Panel, Handle, Position, MarkerType, useReactFlow,
    type Node, type Edge, type NodeProps, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress, Alert, Button,
    Checkbox, FormControlLabel,
} from '@mui/material'
import { ArrowBack, Close, Search } from '@mui/icons-material'

interface Props {
    open: boolean
    onClose: () => void
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 64

const closeButtonSx = { '&:hover': { background: 'rgba(255,255,255,0.08)' } }

const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

type NodeKind = 'role' | 'group'

function nodeIdFor(kind: NodeKind, id: string): string {
    return `${kind}:${id}`
}

function parseNodeId(nodeId: string): { kind: NodeKind; id: string } {
    const sep = nodeId.indexOf(':')
    return { kind: nodeId.slice(0, sep) as NodeKind, id: nodeId.slice(sep + 1) }
}

interface RoleNodeData extends Record<string, unknown> {
    kind: 'role'
    role: OrbatRole
    dimmed: boolean
}

interface GroupNodeData extends Record<string, unknown> {
    kind: 'group'
    group: OrbatRoleGroup
    dimmed: boolean
}

type RoleFlowNode = Node<RoleNodeData, 'roleNode'>
type GroupFlowNode = Node<GroupNodeData, 'groupNode'>
type ChainFlowNode = RoleFlowNode | GroupFlowNode

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
            {role.tag && (
                <span style={{ display: 'inline-block', fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(219,0,29,0.14)', color: 'rgba(219,0,29,0.85)', marginBottom: 4 }}>
                    {role.tag}
                </span>
            )}
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

function GroupNode({ data }: NodeProps<GroupFlowNode>) {
    const { group, dimmed } = data
    return (
        <div style={{
            width: NODE_WIDTH, minHeight: NODE_HEIGHT, padding: '8px 12px',
            background: 'rgba(20,20,20,0.95)', border: '1px dashed rgba(100,180,255,0.6)', borderTop: '2px dashed rgba(100,180,255,0.8)',
            opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.15s',
        }}>
            <Handle type='target' position={Position.Top} style={{ background: 'rgba(100,180,255,0.7)' }} />
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(100,180,255,0.85)', marginBottom: 3 }}>
                Group
            </div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.9)', fontWeight: 600, marginBottom: 6, wordBreak: 'break-word' }}>
                {group.name}
            </div>
            <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(100,180,255,0.12)', color: 'rgba(100,180,255,0.85)' }}>
                {group.memberRoleIds.length} member{group.memberRoleIds.length === 1 ? '' : 's'}
            </span>
            <Handle type='source' position={Position.Bottom} style={{ background: 'rgba(100,180,255,0.7)' }} />
        </div>
    )
}

const nodeTypes = { roleNode: RoleNode, groupNode: GroupNode }

function edgeFor(sourceId: string, targetId: string): Edge {
    return {
        id: `${sourceId}->${targetId}`,
        source: sourceId,
        target: targetId,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(219,0,29,0.6)' },
        style: { stroke: 'rgba(219,0,29,0.5)' },
    }
}

function layoutChainOfCommand(roles: OrbatRole[], groups: OrbatRoleGroup[], search: string): { nodes: ChainFlowNode[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const role of roles) {
        g.setNode(nodeIdFor('role', String(role._id)), { width: NODE_WIDTH, height: NODE_HEIGHT })
    }
    for (const group of groups) {
        g.setNode(nodeIdFor('group', String(group._id)), { width: NODE_WIDTH, height: NODE_HEIGHT })
    }

    const edges: Edge[] = []
    for (const role of roles) {
        const id = nodeIdFor('role', String(role._id))
        if (role.parentRoleId) {
            const parentId = nodeIdFor('role', String(role.parentRoleId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        } else if (role.parentGroupId) {
            const parentId = nodeIdFor('group', String(role.parentGroupId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        }
    }
    for (const group of groups) {
        const id = nodeIdFor('group', String(group._id))
        if (group.parentRoleId) {
            const parentId = nodeIdFor('role', String(group.parentRoleId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        } else if (group.parentGroupId) {
            const parentId = nodeIdFor('group', String(group.parentGroupId))
            g.setEdge(parentId, id)
            edges.push(edgeFor(parentId, id))
        }
    }

    dagre.layout(g)

    const term = search.trim().toLowerCase()
    const roleNodes: RoleFlowNode[] = roles.map(role => {
        const id = nodeIdFor('role', String(role._id))
        const pos = g.node(id)
        const dimmed = term.length > 0 && !role.name.toLowerCase().includes(term)
        return {
            id,
            type: 'roleNode',
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
            data: { kind: 'role', role, dimmed },
        }
    })
    const groupNodes: GroupFlowNode[] = groups.map(group => {
        const id = nodeIdFor('group', String(group._id))
        const pos = g.node(id)
        const dimmed = term.length > 0 && !group.name.toLowerCase().includes(term)
        return {
            id,
            type: 'groupNode',
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
            data: { kind: 'group', group, dimmed },
        }
    })

    return { nodes: [...roleNodes, ...groupNodes], edges }
}

function Canvas({ roles, groups, search, error, onConnectNodes, onSelectRole, onSelectGroup, onReset }: {
    roles: OrbatRole[]
    groups: OrbatRoleGroup[]
    search: string
    error: string | null
    onConnectNodes: (childKind: NodeKind, childId: string, parentKind: NodeKind, parentId: string) => void
    onSelectRole: (role: OrbatRole) => void
    onSelectGroup: (group: OrbatRoleGroup) => void
    onReset: () => void
}) {
    const { nodes, edges } = useMemo(() => layoutChainOfCommand(roles, groups, search), [roles, groups, search])
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
        const parent = parseNodeId(connection.source)
        const child = parseNodeId(connection.target)
        onConnectNodes(child.kind, child.id, parent.kind, parent.id)
    }

    function handleNodeClick(_event: React.MouseEvent, node: ChainFlowNode) {
        if (node.data.kind === 'role') onSelectRole(node.data.role)
        else onSelectGroup(node.data.group)
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
                <Panel position='bottom-right'>
                    <Button
                        size='small' variant='outlined' onClick={onReset}
                        sx={{ fontSize: '0.6rem', letterSpacing: 0.5, borderColor: 'rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.6)', opacity: 0.7, '&:hover': { opacity: 1 } }}
                    >
                        Reset Chain of Command
                    </Button>
                </Panel>
            </ReactFlow>
        </Box>
    )
}

export default function ChainOfCommandPanel({ open, onClose }: Props) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [groups, setGroups] = useState<OrbatRoleGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [selectedRole, setSelectedRole] = useState<OrbatRole | null>(null)
    const [groupEditor, setGroupEditor] = useState<{ id: string | null; name: string; memberRoleIds: string[] } | null>(null)
    const [groupMemberSearch, setGroupMemberSearch] = useState('')
    const [groupError, setGroupError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [rolesRes, groupsRes] = await Promise.all([
            fetch('/api/admin/orbat/roles').then(r => r.json()).catch(() => ({})),
            fetch('/api/admin/orbat/groups').then(r => r.json()).catch(() => ({})),
        ])
        setRoles(rolesRes.roles ?? [])
        setGroups(groupsRes.groups ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { if (open) load() }, [open, load])
    useEffect(() => {
        if (!open) {
            setSearch('')
            setSelectedRole(null)
            setError(null)
            setGroupEditor(null)
            setGroupMemberSearch('')
            setGroupError(null)
        }
    }, [open])

    async function patchParent(childKind: NodeKind, childId: string, parentKind: NodeKind | null, parentId: string | null) {
        setError(null)
        const body = parentKind === 'role' ? { parentRoleId: parentId }
            : parentKind === 'group' ? { parentGroupId: parentId }
            : { parentRoleId: null, parentGroupId: null }
        const url = childKind === 'role' ? `/api/admin/orbat/roles/${childId}` : `/api/admin/orbat/groups/${childId}`
        try {
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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

    function toggleGroupMember(roleId: string) {
        setGroupEditor(prev => prev && {
            ...prev,
            memberRoleIds: prev.memberRoleIds.includes(roleId)
                ? prev.memberRoleIds.filter(id => id !== roleId)
                : [...prev.memberRoleIds, roleId],
        })
    }

    async function saveGroup() {
        if (!groupEditor) return
        if (!groupEditor.name.trim()) { setGroupError('Name is required'); return }
        setGroupError(null)
        const body = { name: groupEditor.name.trim(), memberRoleIds: groupEditor.memberRoleIds }
        const res = groupEditor.id === null
            ? await fetch('/api/admin/orbat/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await fetch(`/api/admin/orbat/groups/${groupEditor.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setGroupError(data.error ?? 'Save failed')
            return
        }
        setGroupEditor(null)
        await load()
    }

    async function deleteGroup(groupId: string) {
        setGroupError(null)
        const res = await fetch(`/api/admin/orbat/groups/${groupId}`, { method: 'DELETE' })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setGroupError(data.error ?? 'Delete failed')
            return
        }
        setGroupEditor(null)
        await load()
    }

    async function resetChainOfCommand() {
        if (!window.confirm('This will detach every Role and Group from its parent, resetting the chain of command to a flat structure. This cannot be undone. Continue?')) return
        setError(null)
        setSelectedRole(null)
        setGroupEditor(null)
        try {
            const res = await fetch('/api/admin/orbat/chain-of-command/reset', { method: 'POST' })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data.error ?? 'Failed to reset chain of command')
            }
        } catch {
            setError('Network error — could not reset chain of command')
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
                <IconButton size='small' onClick={onClose} sx={closeButtonSx}><ArrowBack sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1 }}>
                {loading && roles.length === 0 && groups.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <CircularProgress size={26} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
                                <TextField
                                    size='small' placeholder='Search roles and groups…' value={search} onChange={e => setSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={{ ...searchFieldSx, flex: 1 }}
                                />
                                <Button
                                    size='small' variant='outlined'
                                    onClick={() => { setSelectedRole(null); setGroupError(null); setGroupMemberSearch(''); setGroupEditor({ id: null, name: '', memberRoleIds: [] }) }}
                                    sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(100,180,255,0.4)', color: 'rgba(237,237,237,0.85)', whiteSpace: 'nowrap' }}
                                >
                                    New Group
                                </Button>
                            </Box>
                            <ReactFlowProvider>
                                <Canvas
                                    roles={roles}
                                    groups={groups}
                                    search={search}
                                    error={error}
                                    onConnectNodes={(childKind, childId, parentKind, parentId) => patchParent(childKind, childId, parentKind, parentId)}
                                    onSelectRole={role => { setSelectedRole(role); setGroupEditor(null) }}
                                    onSelectGroup={group => {
                                        setSelectedRole(null)
                                        setGroupError(null)
                                        setGroupMemberSearch('')
                                        setGroupEditor({ id: String(group._id), name: group.name, memberRoleIds: group.memberRoleIds.map(String) })
                                    }}
                                    onReset={resetChainOfCommand}
                                />
                            </ReactFlowProvider>
                        </Box>

                        {selectedRole && (
                            <Box sx={{ width: 280, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', p: 2, overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>{selectedRole.name}</Typography>
                                    <IconButton size='small' onClick={() => setSelectedRole(null)} sx={closeButtonSx}>
                                        <Close sx={{ fontSize: 14, color: 'rgba(237,237,237,0.4)' }} />
                                    </IconButton>
                                </div>
                                {(selectedRole.parentRoleId || selectedRole.parentGroupId) && (
                                    <Button
                                        size='small' variant='outlined' fullWidth
                                        onClick={() => { patchParent('role', String(selectedRole._id), null, null); setSelectedRole(null) }}
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

                        {groupEditor && (
                            <Box sx={{ width: 280, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', p: 2, overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(100,180,255,0.9)' }}>
                                        {groupEditor.id === null ? 'New Group' : 'Edit Group'}
                                    </Typography>
                                    <IconButton size='small' onClick={() => setGroupEditor(null)} sx={closeButtonSx}>
                                        <Close sx={{ fontSize: 14, color: 'rgba(237,237,237,0.4)' }} />
                                    </IconButton>
                                </div>

                                {groupError && <Alert severity='error' sx={{ fontSize: '0.68rem', mb: 1.5 }}>{groupError}</Alert>}

                                <TextField
                                    size='small' fullWidth label='Name' value={groupEditor.name}
                                    onChange={e => setGroupEditor(prev => prev && { ...prev, name: e.target.value })}
                                    sx={{ mb: 2, ...searchFieldSx }}
                                />

                                {groupEditor.id !== null && (() => {
                                    const liveGroup = groups.find(g => String(g._id) === groupEditor.id)
                                    return liveGroup && (liveGroup.parentRoleId || liveGroup.parentGroupId) ? (
                                        <Button
                                            size='small' variant='outlined' fullWidth
                                            onClick={() => { patchParent('group', groupEditor.id as string, null, null); setGroupEditor(null) }}
                                            sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)', mb: 2 }}
                                        >
                                            Detach from Parent
                                        </Button>
                                    ) : null
                                })()}

                                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                    Members ({groupEditor.memberRoleIds.length})
                                </div>
                                <TextField
                                    size='small' fullWidth placeholder='Search roles…' value={groupMemberSearch}
                                    onChange={e => setGroupMemberSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={{ ...searchFieldSx, mb: 1 }}
                                />
                                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
                                    {roles
                                        .filter(r => r.name.toLowerCase().includes(groupMemberSearch.trim().toLowerCase()))
                                        .map(r => (
                                            <FormControlLabel key={String(r._id)} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                control={
                                                    <Checkbox size='small' checked={groupEditor.memberRoleIds.includes(String(r._id))}
                                                        onChange={() => toggleGroupMember(String(r._id))} />
                                                }
                                                label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{r.name}</span>}
                                            />
                                        ))}
                                    {roles.length === 0 && (
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No roles in the catalog yet.</div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Button size='small' variant='outlined' onClick={saveGroup}
                                        sx={{ borderColor: 'rgba(100,180,255,0.5)', color: 'rgba(237,237,237,0.9)' }}>
                                        Save
                                    </Button>
                                    {groupEditor.id !== null && (
                                        <Button size='small' onClick={() => deleteGroup(groupEditor.id as string)} sx={{ color: 'rgba(219,0,29,0.7)' }}>
                                            Delete Group
                                        </Button>
                                    )}
                                </div>
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
