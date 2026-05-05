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
        side: string
        /** Discord user ID if successfully matched to a website member */
        userId?: string
        /** Display name of the matched member */
        displayName?: string
        /** Milpac username for profile linking */
        username?: string
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
        pageTheme?: 'modern' | 'oldfashioned' | 'scifi'
        coverImage?: string
        mapWorld?: string

        // Convenience mirror of OperationAttendance.assignedPlatoons
        assignedPlatoons?: string[]

        // J2-internal — never rendered on public pages
        internalNotes?: string

        // J6-only — only visible to members with the J6-Game Master role
        zeusNotes?: string
        campaignId?: ObjectId

        // OCAP recording data — linked and synced by HQ
        ocap?: OcapData

        // Soft delete
        deletedAt?: Date
        deletedBy?: string       // Discord user ID
        deletedByName?: string   // Display name for audit
    }

    interface OperationCampaign {
        _id: ObjectId
        name: string
        description?: string
        createdBy: string    // Discord user ID
        createdAt: string    // ISO timestamp
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
