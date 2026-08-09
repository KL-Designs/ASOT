import { ObjectId } from 'mongodb'

export { }

declare global {

    // ── ProseMirror / TipTap JSON types ─────────────────────────────────────

    /** Marks that can appear on inline nodes (bold, italic, etc.) */
    type PMMarkType =
        | { type: 'bold' }
        | { type: 'italic' }
        | { type: 'strike' }
        | { type: 'underline' }
        | { type: 'code' }
        | { type: 'highlight'; attrs?: { color?: string | null } }
        | { type: 'link'; attrs: { href: string; target?: string | null; rel?: string | null } }
        | { type: 'textStyle'; attrs?: Record<string, unknown> }

    /** A text leaf node */
    interface PMTextNode {
        type: 'text'
        text: string
        marks?: PMMarkType[]
    }

    /** An image node — `src` is the stored URL (local `/api/operations/image?...` or external) */
    interface PMImageNode {
        type: 'image'
        attrs: {
            src: string
            alt?: string | null
            title?: string | null
        }
    }

    /** A hard break */
    interface PMHardBreakNode {
        type: 'hardBreak'
        marks?: PMMarkType[]
    }

    /** Block nodes that carry inline children */
    interface PMParagraphNode {
        type: 'paragraph'
        attrs?: { textAlign?: string | null }
        content?: PMInlineNode[]
    }

    interface PMHeadingNode {
        type: 'heading'
        attrs: { level: 1 | 2 | 3 | 4 | 5 | 6; textAlign?: string | null }
        content?: PMInlineNode[]
    }

    interface PMBlockquoteNode {
        type: 'blockquote'
        content?: PMBlockNode[]
    }

    interface PMCodeBlockNode {
        type: 'codeBlock'
        attrs?: { language?: string | null }
        content?: PMTextNode[]
    }

    interface PMHorizontalRuleNode {
        type: 'horizontalRule'
    }

    interface PMListItemNode {
        type: 'listItem'
        content?: PMBlockNode[]
    }

    interface PMBulletListNode {
        type: 'bulletList'
        content?: PMListItemNode[]
    }

    interface PMOrderedListNode {
        type: 'orderedList'
        attrs?: { start?: number }
        content?: PMListItemNode[]
    }

    /** All valid inline nodes */
    type PMInlineNode = PMTextNode | PMImageNode | PMHardBreakNode

    /** All valid block nodes */
    type PMBlockNode =
        | PMParagraphNode
        | PMHeadingNode
        | PMBlockquoteNode
        | PMCodeBlockNode
        | PMHorizontalRuleNode
        | PMBulletListNode
        | PMOrderedListNode

    /** Root document node — this is what TipTap saves to MongoDB */
    interface PMDoc {
        type: 'doc'
        content?: PMBlockNode[]
    }

    // ── Utility: extract all image srcs from a document ─────────────────────

    /**
     * Recursively walk a PMDoc (or any node) and collect every `image` node's
     * `src`.  Useful for auditing which uploads a section references.
     *
     * @example
     * const urls = collectImageUrls(section.content)
     */
    function collectImageUrls(node: PMDoc | PMBlockNode | PMInlineNode | null | undefined): string[]

    // ── Operation types ──────────────────────────────────────────────────────

    interface OperationSection {
        id: string
        title: string
        isPublic: boolean
        content?: PMDoc
    }

    interface OperationPage {
        id: string       // 'main' or random slug
        title: string
        isMain: boolean
        pageType?: string   // e.g. 'zeus' for Zeus Notes pages
        pageColor?: string  // hex color for page theme accent
    }

    interface OperationActivityLog {
        _id: ObjectId
        operationId: ObjectId
        sectionId: string
        sectionTitle: string
        userId: string | null
        userName: string
        userAvatar: string | null
        timestamp: Date
        before: string
        after: string
    }

    interface OcapPlayerStat {
        /** Raw player name from the OCAP recording */
        name: string
        kills: number
        deaths: number
        shots: number
        hits: number
        side: string
        /** Discord user ID if successfully matched to a website member */
        userId?: string
        /** Display name of the matched member */
        displayName?: string
        /** Milpac username for profile linking */
        username?: string
    }

    interface OcapSyncStatus {
        stage: 'downloading' | 'parsing' | 'matching' | 'saving' | 'complete' | 'error'
        message: string
        startedAt: Date
        completedAt?: Date
    }

    interface OcapData {
        /** OCAP internal operation ID */
        recordingId: number
        /** OCAP filename (spaces encoded as 20, no extension) */
        filename: string
        /** Full URL to the OCAP web viewer for this recording */
        viewerUrl: string
        worldName: string
        missionName: string
        /** Duration in seconds */
        missionDuration: number
        date: string
        playerCount: number
        killCount: number
        playerKillCount: number
        sideComposition: Record<string, { players: number; units: number; dead: number; kills: number }>
        playerStats: OcapPlayerStat[]
        syncedAt: Date
    }

    interface MissionDevCompletion {
        completedAt: string       // ISO timestamp
        completedBy: string       // Discord user ID
        completedByName: string
        reviewerName: string      // reviewer display name
        comments?: string
        outcome?: string
    }

    interface MissionDevelopment {
        completions: Record<string, MissionDevCompletion>  // keyed by check ID: 'w16', 'w12', etc.
        lastUpdatedAt?: string
        lastUpdatedBy?: string
    }

    interface Operation {
        _id: ObjectId

        title: string
        department: string
        date: Date
        loreDate: Date | string
        status?: 'Completed' | 'Active' | 'Upcoming' | 'In Development'

        sections?: OperationSection[]
        content?: any  // legacy single-body (pre-sections) — kept for backwards compatibility
        pages?: OperationPage[]
        extraPageSections?: Record<string, OperationSection[]>

        themeColor?: string
        pageTheme?: string
        customTheme?: string
        coverImage?: string
        mapWorld?: string

        // Convenience mirror of OperationAttendance.assignedPlatoons
        assignedPlatoons?: string[]

        // J2-internal — never rendered on public pages
        internalNotes?: string

        // J6-only — only visible to members with the J6-Game Master role
        zeusNotes?: string
        campaignId?: ObjectId
        campaignMissionId?: string
        daySlot?: 'saturday' | 'sunday'
        isSingleMission?: boolean  // explicitly standalone — excluded from campaign organiser detection

        // Mission Development checks
        missionDevelopment?: MissionDevelopment

        // OCAP recording data — linked and synced by HQ
        ocap?: OcapData
        // Transient sync progress — written during sync, cleared on next sync start
        ocapSync?: OcapSyncStatus

        // Ownership — the J2 member responsible for this mission
        ownedBy?: string         // Discord user ID of owner/mission maker
        ownedByName?: string     // Display name of owner
        billetPoints?: number    // Billet points awarded to owner on completion (default 2)

        // Orders acknowledgement — staff who have read and confirmed the orders
        acknowledgements?: Array<{
            userId: string
            userName: string
            acknowledgedAt: string  // ISO timestamp
        }>

        // Soft delete
        deletedAt?: Date
        deletedBy?: string       // Discord user ID
        deletedByName?: string   // Display name for audit
    }

    /** Per-document read receipt for a single page in an operation */
    interface DocAcknowledgement {
        operationId: string
        pageId: string       // 'main' for single-page operations; page.id for multi-page
        userId: string
        userName: string
        acknowledgedAt: string  // ISO timestamp
    }

    interface EraOption {
        _id: ObjectId
        name: string    // Display label shown in the dropdown
        value: string   // Value stored in operation.pageTheme
        order: number   // Sort order (lower = first)
        isDefault?: boolean // Pre-seeded default options
    }

    interface OperationCampaign {
        _id: ObjectId
        name: string
        description?: string
        createdBy: string    // Discord user ID
        createdAt: string    // ISO timestamp
        startDate?: string   // ISO date string e.g. "2026-05-12"
        endDate?: string     // ISO date string e.g. "2026-05-26"
        status?: 'Active' | 'Upcoming' | 'Completed' | 'In Development'  // explicit override
        isDeleted?: boolean
        deletedAt?: string
        deletedBy?: string
    }

    interface CampaignMission {
        _id?: import('mongodb').ObjectId
        campaignId: string
        name: string        // "Operation Iron Dagger I"
        sequence: number    // 1, 2, 3...
        saturdayOpId?: string
        sundayOpId?: string
        createdAt: Date
        createdBy?: string       // Discord user ID of creator
        isDeleted?: boolean
        deletedAt?: string
        deletedBy?: string       // Discord user ID
        deletedByName?: string
    }

    interface OperationTemplate {
        _id: ObjectId
        name: string
        description?: string
        sections?: OperationSection[]
        pages?: OperationPage[]
        extraPageSections?: Record<string, OperationSection[]>
        createdBy: string    // Discord user ID
        createdAt: string    // ISO timestamp
    }

}
