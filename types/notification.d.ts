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
    | 'task_extension_requested'
    | 'task_extension_approved'
    | 'task_extension_denied'
    | 'task_extension_alternative'   // Approver suggests an alternative due date
    | 'task_reminder'                // Chase-up reminder fired at reminderDateTime
    | 'task_overdue'                 // Task is past due and not completed
    | 'task_reassignment_requested'  // Assignee wants task reassigned
    | 'task_reassignment_approved'   // Reassignment approved — new member notified
    | 'task_reassignment_denied'     // Reassignment denied — original member notified
    | 'task_delete_requested'        // Assignee requested task deletion
    | 'task_delete_approved'         // Task deletion approved — task removed
    | 'task_delete_denied'           // Task deletion denied — task stays
    | 'calendar_reminder'
    | 'meeting_created'
    | 'meeting_started'
    | 'meeting_reminder'
    | 'meeting_task_assigned'
    | 'meeting_attendance_overdue'
    | 'meeting_task_chaseup'
    | 'quiz_assigned'
    | 'quiz_submitted'
    | 'quiz_result'
    | 'quiz_review_requested'
    | 'ticket_assigned'
    | 'ticket_transferred'
    | 'ticket_status_changed'
    | 'ticket_reopened'
    | 'ticket_task_assigned'
    | 'ticket_comment'
    | 'training_event_submitted'    // J3 leads: new event needs review
    | 'training_event_approved'     // Trainer: your event was approved
    | 'training_event_rejected'     // Trainer: your event was rejected
    | 'training_event_cancelled'    // Attending members: event was cancelled
    | 'training_event_completed'    // Trainer: your event was marked complete (billet points awarded)
    | 'training_rsvp_promoted'      // Waitlisted member auto-promoted to attending
    | 'training_doc_submitted'          // J3 leads: trainer submitted a document for review
    | 'training_doc_approved'           // Trainer: your submitted document was approved
    | 'training_doc_rejected'           // Trainer: your submitted document was rejected
    | 'training_qualification_awarded'  // Member: qualification added to milpac
    | 'system'

type TaskType = 'manual' | 'attendance' | 'application_review' | 'j4_returning_review' | 'extension_review' | 'quiz_assigned' | 'dev_check' | 'orders_check'

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
    startedAt?: Date            // Set when status changes to in_progress
    completedAt?: Date
    // Mission development check fields (type === 'dev_check')
    missionDevCheckId?: string  // Which check stage: 'w16' | 'w12' | 'w10' | 'w8' | 'w6' | 'w4'
    escalatedAt?: Date          // Set when stage-arrival escalation has been dispatched
    // Orders check scheduling fields (type === 'orders_check')
    ordersCheckAt?: string       // ISO timestamp — mission maker's requested datetime
    ordersCheckStatus?: 'pending' | 'confirmed' | 'proposed'
    ordersCheckProposedAt?: string   // ISO timestamp — J2 proposed alternative time
    ordersCheckProposedBy?: string   // Display name of J2 member who proposed alternative
    extensionRequest?: {
        requestedDate: Date          // Requested new due date/time (datetime, not date-only)
        reason: string
        requestedAt: Date
        status: 'pending' | 'approved' | 'denied' | 'alternative'
        approverNote?: string        // Optional note from the approver
        alternativeDate?: Date       // Set when approver suggests a different date
        alternativeReminderDate?: Date  // Optional new reminder if approver suggests alternative
    }
    // Reassignment request (assignee requests task be given to someone else)
    reassignmentRequest?: {
        requestedToId: string        // Discord user ID of requested new assignee
        requestedToName: string      // Display name of requested new assignee
        reason: string
        requestedAt: Date
        status: 'pending' | 'approved' | 'denied' | 'redirected'
        approverNote?: string
        finalAssigneeId?: string     // Set when approver redirects to a different person
        finalAssigneeName?: string
    }
    createdAt: Date
    status: TaskStatus
    department?: string         // Optional department tag (j1, j2, etc.)
    notes?: string              // Follow-up notes on completion
    type?: TaskType             // Task category; 'manual' if unset
    actionUrl?: string          // Deep link for task completion context
    relatedId?: string          // ID of related entity (operationId, applicationId, etc.)
    // Delete request (assignee requests creator approve deletion)
    deleteRequest?: {
        reason?: string
        requestedAt: Date
        requestedById: string
        requestedByName: string
        status: 'pending' | 'approved' | 'denied'
        approverNote?: string
    }
    // Reminder / chase-up
    reminderDateTime?: Date     // Optional chase-up date — notification fires at this time
    reminderNotifiedAt?: Date   // Set once the reminder notification has been dispatched
    // Due / overdue notifications
    dueNotificationSentAt?: Date // Set once the due/overdue notification has been dispatched
    // Escalation tracking
    escalationLevel?: number    // 0=none, 1=first threshold notified, 2=second threshold notified
    escalationNotifiedAt?: Date // When last escalation notification was sent
}

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'
