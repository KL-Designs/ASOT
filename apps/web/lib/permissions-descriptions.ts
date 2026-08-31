// Short, human-readable descriptions for every key in `PERMISSIONS` (permissions.ts),
// shown as grey undertext beneath each permission checkbox in the ORBAT Roles and
// Department Roles editors. Plain-English summary only — the authoritative
// description (who's affected, which routes use it, migration status) lives in
// permissions.ts's JSDoc above each key.
export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
    'pages.dashboard': 'Lets any ASOT member open the staff dashboard.',
    'pages.admin': 'Full access to staff-only dashboard sections.',
    'pages.members': 'View the public member list and personnel pages.',
    'pages.operationsEdit': 'Open the mission/operations editor.',

    'departments.j1': 'Counts as a J1 (Recruitment) department member.',
    'departments.j2': 'Counts as a J2 (Mission Making) department member.',
    'departments.j3': 'Counts as a J3 (Training) department member.',
    'departments.j4': 'Counts as a J4 (Administration) department member.',
    'departments.j5': 'Counts as a J5 (Media) department member.',
    'departments.j6': 'Counts as a J6 (Game Master) department member.',
    'departments.j7': 'Counts as a J7 (Community Development) department member.',

    'operations.write': 'Create, edit, delete, and manage operations and campaigns.',
    'operations.viewInDevelopment': 'See operations still marked In Development on the public board.',

    'uploads.bio': "Upload member bio/profile images.",

    'members.edit': "View a member's confirmed operations history.",
    'members.editRestricted': 'Edit sensitive milpac fields — billet points, rank, enlistment date.',
    'members.editStandard': 'Edit standard milpac fields — promotions, qualifications, awards, display name.',

    'admin.impersonate': 'Temporarily log in as another user for testing or support.',
    'admin.manageOrbat': 'View and navigate the ORBAT (order of battle).',
    'admin.manageOrbatStructure': 'Create, rename, delete, and reorder ORBAT sections and positions.',
    'admin.manageOrbatMembers': 'Assign or remove members from ORBAT positions, manage reservists.',
    'admin.manageOrbatRoles': 'Create, edit, and delete ORBAT position-role definitions.',
    'admin.manageDepartmentRoles': 'Create, edit, and delete department (J1-J7) role definitions.',
    'admin.viewPermissionsTree': 'View the Permissions Explorer — who has access to what, sitewide.',
    'admin.massImport': 'Bulk-replace milpac, ORBAT, or attendance data from CSV files.',

    'optionals.manage': "Add or remove mods from the unit's optional mod lists.",

    'feedback.manageStatus': 'Change the status on bug reports and feature requests.',

    'communityTickets.manage': 'Manage all community tickets, including private and deleted ones.',

    'gallery.manage': 'Manage the media gallery — folders, images, featured photo, Shot of the Month.',
    'gallery.submit': 'Submit photos, video and YouTube/Twitch links to the gallery for review.',
    'gallery.review': 'Review submitted gallery media — accept, reject, or correct its caption, tags and operation.',
    'gallery.tags': 'Manage the gallery tag vocabulary.',

    'attendance.confirm': 'Confirm member attendance after an operation has run.',

    'auth.collab': 'Connect to the real-time collaborative document editor.',

    'departmentLeads.j1': 'Leads J1 — can add/remove J1 members and manage membership tickets.',
    'departmentLeads.j2': 'Leads J2 — can add/remove J2 members and manage membership tickets.',
    'departmentLeads.j3': 'Leads J3 — can add/remove J3 members and manage membership tickets.',
    'departmentLeads.j4': 'Leads J4 — can add/remove J4 members and manage membership tickets.',
    'departmentLeads.j5': 'Leads J5 — can add/remove J5 members and manage Shot of the Month.',
    'departmentLeads.j6': 'Leads J6 — can add/remove J6 members and manage membership tickets.',
    'departmentLeads.j7': 'Leads J7 — can add/remove J7 members and manage membership tickets.',

    'meetings.lockJ1': "Lock or unlock J1's meeting records so they can't be edited.",
    'meetings.lockJ2': "Lock or unlock J2's meeting records so they can't be edited.",
    'meetings.lockJ3': "Lock or unlock J3's meeting records so they can't be edited.",
    'meetings.lockJ4': "Lock or unlock J4's meeting records so they can't be edited.",
    'meetings.lockJ5': "Lock or unlock J5's meeting records so they can't be edited.",
    'meetings.lockJ6': "Lock or unlock J6's meeting records so they can't be edited.",
    'meetings.lockJ7': "Lock or unlock J7's meeting records so they can't be edited.",

    'deptLinks.manage': "Add, edit, delete, reorder, and control who can see a department's quick links.",

    'backups.manage': 'View the backup timeline and storage usage, trigger a backup, download a backup point, and extend retention.',
    'backups.restore': 'Revert to a backup point, or upload a ZIP and restore from it. Destructive — always takes a safety backup first.',

    'quiz.assign': 'Assign the BCT quiz to a recruit and view training records.',
    'quiz.review': 'Review a submitted quiz attempt — pass it, fail it, or escalate it.',
    'quiz.reviewEscalated': 'Handle quiz reviews escalated up from a trainer or department lead.',

    'trainingDocs.manage': 'Create, rename, and delete training documents.',

    'trainingGuides.write': 'Create and edit structured training session guides.',
    'trainingGuides.approve': 'Approve a training guide, promoting it from draft to approved.',
    'trainingGuides.delete': 'Delete a training guide.',

    'sops.manage': 'Create, edit, and delete SOP documents.',

    'training.create': 'Request a training event/session for J3 approval.',
    'training.trainer': 'Fill a Trainer slot on a training event.',
    'training.manage': 'Approve or reject training requests and manage training types.',

    'masterSheet.view': 'View non-sensitive master sheet data — leaving history, denied applications.',
    'masterSheet.viewDiscipline': "View members' discipline records.",
    'masterSheet.import': 'Import or replace master sheet data from CSV.',

    'tickets.actionJ1': 'Approve or reject J1 department tickets.',
    'tickets.actionJ2': 'Approve or reject J2 department tickets.',
    'tickets.actionJ3': 'Approve or reject J3 qualification and promotion tickets.',
    'tickets.actionJ4': 'Approve or reject J4 tickets — awards, discharges, performance reports.',
    'tickets.actionJ6': 'Approve or reject J6 department tickets.',
    'tickets.actionJ7': 'Approve or reject J7 department tickets.',
    'tickets.actionMoveRequest': 'Override-approve move request tickets to unblock stuck ones.',
    'tickets.actionDiscipline': "Approve or reject discipline tickets that deduct discipline points.",

    'intel.generateImages': 'Generate intel images with the AI image creator.',
    'intel.viewAllImages': "View every member's generated intel images, not just your own.",

    'ai.manage': 'Manage AI budgets, usage caps, and provider settings.',
    'ai.use': 'Use AI features that consume AI credits.',
}
