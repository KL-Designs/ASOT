/** Metadata for every notification type — drives the Preferences UI. */

export interface NotifTypeMeta {
    type: NotificationType
    label: string
    description: string
    category: string
    /** Roles/features that must be present for this pref to show. Empty = show to all. */
    requiresAny?: string[]
    /** Cannot be disabled by the user (always on) */
    alwaysOn?: boolean
}

export const NOTIFICATION_TYPES: NotifTypeMeta[] = [
    // ── Tickets ──────────────────────────────────────────────────────────────
    {
        type: 'ticket_assigned',
        label: 'Ticket assigned to your department',
        description: 'When a new ticket is routed or transferred to your department.',
        category: 'Tickets',
        requiresAny: ['J1-Staff','J1-Recruiting','J2-Team Lead','J2-Mission Making','J3-Team Lead','J3-Training','J4-Administration','J5-Media','J6-Department Lead','J6-Game Master','J7 Staff','J7 Community Development'],
    },
    {
        type: 'ticket_transferred',
        label: 'Ticket transferred',
        description: 'When a ticket is transferred between departments.',
        category: 'Tickets',
        requiresAny: ['J1-Staff','J2-Team Lead','J3-Team Lead','J4-Administration','J5-Media','J6-Department Lead','J7 Staff'],
    },
    {
        type: 'ticket_status_changed',
        label: 'Ticket status changed',
        description: 'When a ticket you submitted changes status.',
        category: 'Tickets',
    },
    {
        type: 'ticket_reopened',
        label: 'Ticket reopened',
        description: 'When a closed ticket is reopened.',
        category: 'Tickets',
        requiresAny: ['J1-Staff','J2-Team Lead','J3-Team Lead','J4-Administration','J5-Media','J6-Department Lead','J7 Staff'],
    },
    {
        type: 'ticket_task_assigned',
        label: 'Ticket task assigned to you',
        description: 'When a task on a ticket is assigned to you.',
        category: 'Tickets',
    },
    {
        type: 'ticket_comment',
        label: 'Ticket comment activity',
        description: 'When someone comments on a ticket you submitted or are following.',
        category: 'Tickets',
    },

    // ── Meetings ─────────────────────────────────────────────────────────────
    {
        type: 'meeting_created',
        label: 'Meeting invitation',
        description: 'When you are invited to or notified about a new meeting.',
        category: 'Meetings',
    },
    {
        type: 'meeting_reminder',
        label: 'Meeting reminder',
        description: 'Reminder notification before a meeting starts.',
        category: 'Meetings',
    },
    {
        type: 'meeting_started',
        label: 'Meeting starting now',
        description: 'When a meeting you are invited to is starting.',
        category: 'Meetings',
    },
    {
        type: 'meeting_task_assigned',
        label: 'Meeting task assigned to you',
        description: 'When a meeting task is assigned to you.',
        category: 'Meetings',
    },
    {
        type: 'meeting_attendance_overdue',
        label: 'Attendance confirmation overdue',
        description: 'Reminder to confirm attendance after a meeting.',
        category: 'Meetings',
        requiresAny: ['J1-Staff','J2-Team Lead','J3-Team Lead','J4-Administration','J5-Media','J6-Department Lead','J7 Staff'],
    },
    {
        type: 'meeting_task_chaseup',
        label: 'Meeting task chase-up',
        description: 'Chase-up reminder for an incomplete meeting task assigned to you.',
        category: 'Meetings',
    },

    // ── Tasks ─────────────────────────────────────────────────────────────────
    {
        type: 'task_assigned',
        label: 'Task assigned to you',
        description: 'When a unit task is assigned to you.',
        category: 'Tasks',
    },
    {
        type: 'task_extended',
        label: 'Task due date extended',
        description: 'When the due date on one of your tasks is extended.',
        category: 'Tasks',
    },
    {
        type: 'task_completed',
        label: 'Task completed',
        description: 'When a task you assigned is marked complete.',
        category: 'Tasks',
    },

    // ── Calendar ──────────────────────────────────────────────────────────────
    {
        type: 'calendar_reminder',
        label: 'Calendar event reminder',
        description: 'Reminder before a calendar event you are attending.',
        category: 'Calendar',
    },

    // ── General ───────────────────────────────────────────────────────────────
    {
        type: 'system',
        label: 'System notifications',
        description: 'Important system-level alerts. These cannot be disabled.',
        category: 'General',
        alwaysOn: true,
    },
]

export const NOTIF_CATEGORIES = [...new Set(NOTIFICATION_TYPES.map(t => t.category))]
