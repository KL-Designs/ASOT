interface Notification {
    _id?: import('mongodb').ObjectId
    userId: string          // Discord user ID (recipient)
    type: NotificationType
    title: string
    body: string
    actionUrl?: string      // Route to navigate to on click
    relatedId?: string      // ID of related entity (task, event, etc.)
    createdAt: Date
    readAt?: Date           // undefined = unread
    dismissedAt?: Date      // undefined = not dismissed
}

type NotificationType =
    | 'task_assigned'
    | 'task_extended'
    | 'task_completed'
    | 'calendar_reminder'
    | 'meeting_task_assigned'
    | 'system'

interface Task {
    _id?: import('mongodb').ObjectId
    title: string
    description?: string
    assignedTo?: string         // Discord user ID (specific member), or undefined if role-based
    assignedToName?: string     // Display name of assignee
    assignedRole?: string       // Role name if assigned to a role
    assignedBy: string          // Discord user ID of creator
    assignedByName: string      // Display name of creator
    dueDate?: Date
    originalDueDate?: Date      // Set when due date is extended
    extendedAt?: Date
    completedAt?: Date
    createdAt: Date
    status: TaskStatus
    department?: string         // Optional department tag (j1, j2, etc.)
    notes?: string              // Follow-up notes on completion
}

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'
