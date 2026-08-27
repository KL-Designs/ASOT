'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import Panel from './Panel'
import MapWorldPicker from './MapWorldPicker'

interface Props {
    title: string
    onTitleChange: (v: string) => void

    ownedBy: string
    ownedByName: string
    canPickOwner: boolean
    ownerPickerOpen: boolean
    j2Members: { id: string; displayName: string }[]
    onOpenOwnerPicker: () => void
    onCloseOwnerPicker: () => void
    onSelectOwner: (id: string, displayName: string) => void

    canSeeBilletPoints: boolean
    billetPoints: number
    onBilletPointsChange: (v: number) => void
    onBilletPointsBlur: () => void

    department: string
    onDepartmentChange: (v: string) => void

    themeColor: string
    onThemeColorChange: (v: string) => void

    pageTheme: string
    eraOptions: { _id: string; name: string; value: string }[]
    onPageThemeChange: (v: string) => void

    mapWorld: string
    availableWorlds: { name: string; displayName: string; hasPreview: boolean }[]
    onMapWorldChange: (v: string) => void

    loreDateDayjs: Dayjs | null
    onLoreDateChange: (v: Dayjs | null) => void

    coverImage: string | null
    coverUploading: boolean
    onUploadCover: (file: File) => void
    onRemoveCover: () => void
}

const rowStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '9px 16px', borderBottom: '1px solid var(--line)',
}

const keyStyle: CSSProperties = {
    fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--ink-3)', flexShrink: 0,
}

const valueStyle: CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)',
    textAlign: 'right', minWidth: 0,
}

const controlStyle: CSSProperties = {
    background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)',
    color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 11.5,
    padding: '5px 8px', outline: 'none', textAlign: 'right', maxWidth: 168,
}

/** One `rw`/`rwK`/`rwV` data row — label left, value/control right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={rowStyle}>
            <span style={keyStyle}>{label}</span>
            <span style={valueStyle}>{children}</span>
        </div>
    )
}

/**
 * Replaces the old "Operation Details" panel's metadata fields (Task 11).
 * Owns the same scheduleSave/fetch call sites page.tsx already had — this
 * card is presentation only, every handler is passed down from page.tsx so
 * the save paths (and their exact keys/endpoints) don't move.
 *
 * Not rehomed here: the orders-acknowledgement block, still left mounted in
 * page.tsx pending Task 12's Attendance tab (see the task-11 report). The
 * cover photo *is* rehomed here as a compact data row — see the "Cover" row
 * below.
 */
export default function DetailsCard({
    title, onTitleChange,
    ownedBy, ownedByName, canPickOwner, ownerPickerOpen, j2Members, onOpenOwnerPicker, onCloseOwnerPicker, onSelectOwner,
    canSeeBilletPoints, billetPoints, onBilletPointsChange, onBilletPointsBlur,
    department, onDepartmentChange,
    themeColor, onThemeColorChange,
    pageTheme, eraOptions, onPageThemeChange,
    mapWorld, availableWorlds, onMapWorldChange,
    loreDateDayjs, onLoreDateChange,
    coverImage, coverUploading, onUploadCover, onRemoveCover,
}: Props) {

    return (
        <Panel title="Details">
            {/* Title — kept as its own prominent field rather than a data row,
                same visual weight the old panel gave it. */}
            <div style={{ padding: '14px 16px 0' }}>
                <input
                    value={title}
                    placeholder="Operation Name"
                    onChange={e => onTitleChange(e.target.value)}
                    style={{
                        width: '100%', background: 'transparent', border: 'none',
                        borderBottom: '1px solid var(--line-2)',
                        color: 'var(--ink)', fontSize: 15, fontWeight: 700,
                        letterSpacing: '0.04em',
                        outline: 'none', padding: '4px 0 8px', boxSizing: 'border-box',
                    }}
                />
            </div>

            <div style={{ marginTop: 4 }}>
                <Row label="Owner">
                    {ownerPickerOpen && canPickOwner ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                                defaultValue={ownedBy}
                                onChange={e => {
                                    const sel = j2Members.find(m => m.id === e.target.value)
                                    if (sel) onSelectOwner(sel.id, sel.displayName)
                                }}
                                style={{ ...controlStyle, textAlign: 'left' }}
                            >
                                <option value="">— Select member —</option>
                                {j2Members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                            </select>
                            <button type="button" onClick={onCloseOwnerPicker}
                                style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 10, cursor: 'pointer', padding: 0 }}
                            >Cancel</button>
                        </div>
                    ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontStyle: ownedByName ? 'normal' : 'italic', color: ownedByName ? 'var(--ink)' : 'var(--ink-3)' }}>
                                {ownedByName || 'Unassigned'}
                            </span>
                            {canPickOwner && (
                                <button type="button" onClick={onOpenOwnerPicker}
                                    style={{ background: 'none', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', color: 'var(--acc)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', cursor: 'pointer' }}
                                >Change</button>
                            )}
                        </span>
                    )}
                </Row>

                {canSeeBilletPoints && (
                    <Row label="Billet Points">
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={billetPoints}
                            onChange={e => onBilletPointsChange(Math.max(0, parseInt(e.target.value) || 0))}
                            onBlur={onBilletPointsBlur}
                            style={{ ...controlStyle, width: 60, maxWidth: 60, textAlign: 'center' }}
                        />
                    </Row>
                )}

                <Row label="Department">
                    <input
                        value={department}
                        placeholder="Department"
                        onChange={e => onDepartmentChange(e.target.value)}
                        style={controlStyle}
                    />
                </Row>

                {/* Status and Complete Mission used to sit here. They are not
                    metadata — "In Development" suspends every automation and
                    "Completed" opens attendance confirmation and issues tasks —
                    so they moved to the Schedule tab's lifecycle override,
                    beside the ribbon whose behaviour they change, and behind
                    `operations.overrideLifecycle`. The status itself is shown
                    in the header. */}

                <Row label="Cover">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {coverImage && (
                            <img
                                src={coverImage}
                                alt=""
                                style={{
                                    width: 56, height: 32, objectFit: 'cover',
                                    borderRadius: 'var(--r)', border: '1px solid var(--line-2)',
                                    display: 'block', flexShrink: 0,
                                }}
                            />
                        )}
                        <label style={{
                            fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: coverUploading ? 'var(--ink-3)' : 'var(--acc)',
                            cursor: coverUploading ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                        }}>
                            {coverUploading ? 'Uploading…' : coverImage ? 'Replace' : 'Upload'}
                            <input
                                type="file"
                                accept="image/*"
                                disabled={coverUploading}
                                style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) onUploadCover(f) }}
                            />
                        </label>
                        {coverImage && (
                            <button
                                type="button"
                                onClick={onRemoveCover}
                                disabled={coverUploading}
                                style={{
                                    background: 'none', border: 'none', padding: 0,
                                    fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700,
                                    letterSpacing: '0.1em', textTransform: 'uppercase',
                                    color: 'var(--ink-3)',
                                    cursor: coverUploading ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Remove
                            </button>
                        )}
                    </span>
                </Row>

                <Row label="Theme Colour">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                            type="color"
                            value={themeColor}
                            onChange={e => onThemeColorChange(e.target.value)}
                            style={{ width: 20, height: 20, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }}
                        />
                        <span>{themeColor}</span>
                    </label>
                </Row>

                <Row label="Era">
                    <select
                        value={pageTheme ?? 'modern'}
                        onChange={e => onPageThemeChange(e.target.value)}
                        style={{ ...controlStyle, cursor: 'pointer' }}
                    >
                        {eraOptions.length > 0
                            ? eraOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.name}</option>)
                            : (
                                <>
                                    <option value="modern">Modern</option>
                                    <option value="wwii">WWII</option>
                                    <option value="vietnam">Vietnam</option>
                                    <option value="coldwar">Cold War</option>
                                    <option value="fantasy">Fantasy</option>
                                    <option value="scifi">Sci-Fi</option>
                                </>
                            )
                        }
                    </select>
                </Row>

                <Row label="Map">
                    <MapWorldPicker
                        value={mapWorld}
                        worlds={availableWorlds}
                        onChange={onMapWorldChange}
                        themeColor={themeColor}
                    />
                </Row>

                <div style={{ padding: '12px 16px 16px' }}>
                    <div style={{ ...keyStyle, marginBottom: 8 }}>In-Game Date &amp; Time</div>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DateTimePicker
                            value={loreDateDayjs}
                            format="DD/MM/YYYY HH:mm"
                            onChange={onLoreDateChange}
                            slotProps={{ textField: { size: 'small', sx: pickerSx } }}
                        />
                    </LocalizationProvider>
                </div>
            </div>
        </Panel>
    )
}

const pickerSx = {
    width: '100%',
    '& .MuiInputBase-root': {
        background: 'var(--s2)',
        borderRadius: 'var(--r)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
    },
    '& .MuiOutlinedInput-notchedOutline': {
        border: '1px solid var(--line-2)',
    },
    '& .MuiInputBase-input': {
        color: 'var(--ink-2)',
        padding: '6px 10px',
    },
    '& .MuiSvgIcon-root': {
        color: 'var(--ink-3)',
        fontSize: 16,
    },
}
