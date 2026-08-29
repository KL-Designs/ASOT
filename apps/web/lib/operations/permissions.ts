import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'

/**
 * @file Who can do what in an operation.
 *
 * The operations area used to hang from a single Discord-role check —
 * `client.hasRoles(me, PERMISSIONS.pages.operationsEdit)` — which answered
 * every question at once: open the editor, write the orders, change the
 * schedule, move the roster, link a replay. One role, five jobs, and no way to
 * hand somebody one of them.
 *
 * This file is the replacement: one capability per thing a person can actually
 * do, each with its own key. Every gate in the operations area goes through
 * `can()` rather than reaching for a permission key directly, so the answer to
 * "who may edit the map" lives in one table instead of being restated at each
 * of its call sites — which is how the old check ended up meaning five
 * different things.
 *
 * ── Why every rule has a legacy arm ─────────────────────────────────────────
 *
 * `hasPermission` has no Discord-role fallback, so a brand-new key is false for
 * everybody — admins included — until somebody grants it in the Roles Manager.
 * Introducing thirteen of them at once and checking only the new way would
 * have locked every member of staff out of the operations area at the moment
 * it deployed. So each rule also accepts whoever passes the check it replaces.
 *
 * That makes this strictly additive: nothing anybody can do today stops
 * working, and the fine-grained keys can be granted at leisure. Retiring the
 * legacy arms later is a per-rule edit in the table below and nowhere else.
 */

export type OperationCapability =
    | 'view'
    | 'zeus'
    | 'orders.view'
    | 'orders.write'
    | 'orders.details'
    | 'map.view'
    | 'map.edit'
    | 'schedule.view'
    | 'schedule.manage'
    | 'schedule.override'
    | 'attendance.view'
    | 'attendance.claim'
    | 'attendance.manage'
    | 'attendance.roles'
    | 'attendance.confirm'
    | 'ocap.view'
    | 'ocap.manage'
    | 'aar.view'
    | 'aar.write'
    | 'aar.manage'

interface Rule {
    /** The dot-path key in `PERMISSIONS` this capability really is. */
    key: string
    /**
     * Who passes without holding anything at all.
     *
     * `'public'` — everybody, signed in or not. `'member'` — anybody signed in.
     * Both are the *current* behaviour of the surface, preserved deliberately:
     * the operations page and the map are public, and any member can read the
     * attendance board and claim a slot. Tightening one of these is deleting a
     * line here, and that is the only place it has to happen.
     *
     * A baseline short-circuits the key, so granting the key changes nothing
     * while the baseline stands. That is not an accident — the key is the
     * vehicle that will carry the surface once the baseline goes, and it is
     * already in the Roles Manager so the grants can be set up first.
     */
    baseline?: 'public' | 'member'
    /** Older permission keys that still satisfy this, via `hasPermission`. */
    legacyKeys?: string[]
    /** Discord role arrays that still satisfy this, via `client.hasRoles`. */
    legacyRoles?: string[][]
}

const RULES: Record<OperationCapability, Rule> = {
    /*
     * Reading an operation past what a visitor sees — the sections that are not
     * public, and operations that are not on the board. The page itself stays
     * public, so this is the layer above it rather than a gate on the page.
     */
    view: {
        key: 'operations.view',
        baseline: 'member',
    },

    /* Zeus Notes pages: ordinary documents, and this is the only thing that
       separates them. Without it they are not listed anywhere. */
    zeus: {
        key: 'operations.zeus',
        legacyRoles: [PERMISSIONS.departments.j6],
    },

    /* The editor shell, read-only. Reviewing orders and writing them are
       different jobs. */
    'orders.view': {
        key: 'operations.orders.view',
        legacyKeys: ['pages.operationsEdit'],
        legacyRoles: [PERMISSIONS.pages.operationsEdit],
    },

    'orders.write': {
        key: 'operations.orders.write',
        legacyKeys: ['operations.write', 'pages.operationsEdit'],
        legacyRoles: [PERMISSIONS.operations.write, PERMISSIONS.pages.operationsEdit],
    },

    /* The mission deck: dates, map, theme, cover, campaign. Scheduling
       authority rather than authoring authority. */
    'orders.details': {
        key: 'operations.orders.details',
        legacyKeys: ['operations.write'],
        legacyRoles: [PERMISSIONS.operations.write],
    },

    /* The map is public for the same reason the orders are: the link people
       paste to each other has to work for all of them. */
    'map.view': {
        key: 'operations.map.view',
        baseline: 'public',
    },

    'map.edit': {
        key: 'operations.map.edit',
        legacyKeys: ['pages.operationsEdit'],
        legacyRoles: [PERMISSIONS.pages.operationsEdit],
    },

    /* Not public — the Schedule page redirects a viewer without it. */
    'schedule.view': {
        key: 'operations.schedule.view',
        legacyKeys: ['pages.operationsEdit'],
        legacyRoles: [PERMISSIONS.pages.operationsEdit],
    },

    'schedule.manage': {
        key: 'operations.schedule.manage',
        legacyKeys: ['operations.write'],
        legacyRoles: [PERMISSIONS.operations.write],
    },

    /* Not an edit — an override. It suspends every automation, or fires the
       whole completion sequence. */
    'schedule.override': {
        key: 'operations.schedule.override',
        legacyKeys: ['operations.overrideLifecycle'],
        legacyRoles: [PERMISSIONS.operations.overrideLifecycle],
    },

    /* The board is how a member RSVPs and claims a position, so reading it and
       claiming on it are both open to any member. */
    'attendance.view': {
        key: 'attendance.view',
        baseline: 'member',
    },

    'attendance.claim': {
        key: 'attendance.claim',
        baseline: 'member',
    },

    /* Who sits where. Moving other people, not yourself. */
    'attendance.manage': {
        key: 'attendance.manage',
        legacyRoles: [PERMISSIONS.attendance.manage, PERMISSIONS.admin.manageOrbat],
    },

    /* What seats there are. Cutting a section onto an operation's ORBAT is a
       design decision; moving a rifleman into it on the night is not. */
    'attendance.roles': {
        key: 'attendance.roles',
        legacyKeys: ['attendance.manage'],
        legacyRoles: [PERMISSIONS.attendance.manage, PERMISSIONS.admin.manageOrbat],
    },

    'attendance.confirm': {
        key: 'attendance.confirm',
        legacyRoles: [PERMISSIONS.attendance.confirm],
    },

    'ocap.view': {
        key: 'operations.ocap.view',
        baseline: 'member',
    },

    'ocap.manage': {
        key: 'operations.ocap.manage',
        legacyKeys: ['pages.operationsEdit'],
        legacyRoles: [PERMISSIONS.pages.operationsEdit],
    },

    /* The AAR is the same audience as the attendance board — everybody who was
       there — so reading and writing your own both sit on the member baseline. */
    'aar.view': {
        key: 'operations.aar.view',
        baseline: 'member',
    },

    'aar.write': {
        key: 'operations.aar.write',
        baseline: 'member',
    },

    /*
     * Writing up other people. Note what is *not* here: a section's 1IC. That
     * authority is positional — they led the section on the night — and lives
     * in `sectionLead()` rather than in any grant, because no permission was
     * given for it and none could be. This is the staff override beside it.
     */
    'aar.manage': {
        key: 'operations.aar.manage',
        legacyKeys: ['attendance.manage'],
        legacyRoles: [PERMISSIONS.attendance.manage, PERMISSIONS.admin.manageOrbat],
    },
}

/**
 * May this person do this thing?
 *
 * Takes a nullable user so callers can pass `await client.fetchMe()` straight
 * through without a signed-in branch of their own — a logged-out visitor still
 * passes the public capabilities, which is the whole point of them.
 *
 * The baseline is answered before anything else, and that ordering is load
 * bearing: `hasPermission` goes to Mongo twice, and a page that asks eight
 * questions about a member who passes all of them on the baseline should not
 * make sixteen round trips to find that out.
 */
export async function can(user: User | null, capability: OperationCapability): Promise<boolean> {
    const rule = RULES[capability]

    if (rule.baseline === 'public') return true
    if (!user) return false
    if (rule.baseline === 'member') return true

    if (await hasPermission(user, rule.key)) return true

    for (const key of rule.legacyKeys ?? []) {
        if (await hasPermission(user, key)) return true
    }
    for (const roles of rule.legacyRoles ?? []) {
        if (client.hasRoles(user, roles)) return true
    }

    return false
}

/**
 * Several answers at once.
 *
 * Pages need most of the table to decide what to render, and asking one at a
 * time serialises a pile of independent database reads behind each other. The
 * keys of the result are the capabilities that were asked for, so a caller
 * destructures what it needs and TypeScript keeps the two in step.
 */
export async function canEach<T extends OperationCapability>(
    user: User | null,
    capabilities: readonly T[],
): Promise<Record<T, boolean>> {
    const answers = await Promise.all(capabilities.map(cap => can(user, cap)))
    return Object.fromEntries(
        capabilities.map((cap, i) => [cap, answers[i]]),
    ) as Record<T, boolean>
}

/** The table itself, for tests and for the Permissions Explorer. */
export const OPERATION_CAPABILITIES = RULES
