import { createContext, useContext } from 'react'

export type MastersheetSubTab = 'billet' | 'leaving' | 'denied' | 'discipline'

export interface PendingChange {
    id: string                   // `${tab}:${rowId}:${field}`
    tab: MastersheetSubTab
    rowId: string                // MongoDB _id as string (or member _id for billet)
    memberName: string
    field: string
    fieldLabel: string
    oldValue: string | number | boolean | null
    newValue: string | number | boolean | null
}

export interface MastersheetContextValue {
    pendingChanges: Map<string, PendingChange>
    upsertChange: (change: PendingChange) => void
    removeChange: (id: string) => void
    clearAll: () => void
    reviewOpen: boolean
    setReviewOpen: (v: boolean) => void
    jumpTarget: { tab: MastersheetSubTab; rowId: string; field: string } | null
    setJumpTarget: (t: { tab: MastersheetSubTab; rowId: string; field: string } | null) => void
    activeSub: MastersheetSubTab
    setActiveSub: (sub: MastersheetSubTab) => void
}

export const MastersheetContext = createContext<MastersheetContextValue | null>(null)

export function useMastersheetCtx(): MastersheetContextValue {
    const ctx = useContext(MastersheetContext)
    if (!ctx) throw new Error('useMastersheetCtx must be used inside MasterSheetTab')
    return ctx
}
