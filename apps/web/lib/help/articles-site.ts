/**
 * The rest of the site, guide by guide: the staff dashboard, every
 * department's pages and the member pages the starter guides in
 * `articles.ts` don't cover. Same rules as there: built-in copies that J7
 * owns from their first edit.
 *
 * Department guides carry `departments`, so only that department's members
 * (plus J7 reviewers and J4 administration) see them, in the wiki, the FAQ
 * and the assistant's answers. Their audience is `member`: department
 * membership is the gate, not staff rank.
 */

type Seed = Omit<HelpArticle, 'version' | 'updatedAt' | 'updatedById' | 'updatedByName'>

const DEPT_PAGES = ['/dashboard/j1', '/dashboard/j2', '/dashboard/j3', '/dashboard/j4', '/dashboard/j5', '/dashboard/j6', '/dashboard/j7']

export const SITE_ARTICLES: Seed[] = [

    // ── Operations ────────────────────────────────────────────────────────────

    {
        _id: 'attendance-board',
        title: 'The attendance board and roster',
        category: 'operations',
        audience: 'member',
        order: 4,
        summary: 'How slots, reservists, Lead Zeus and confirmation work on an operation.',
        paths: ['/operations/*', '/operations/*/attendance'],
        keywords: ['attendance', 'roster', 'slot', 'slots', 'reservist', 'pool', 'lead zeus', 'zeus', 'confirm', 'confirmation', 'discord post', 'sign up', 'loa'],
        body: `Every main operation has a live attendance board on its page.

## Signing up
1. Open the operation from [Operations](/operations).
2. While RSVPs are open, choose **Attending** or **Not Attending**.
3. Members with a callsign appear in their own section's slots. Reservists go into the **reservist pool** and are placed into empty slots by staff.

The board updates live, so you can watch the roster fill up. The Discord attendance post shows the same roster and has its own sign-up buttons.

## Lead Zeus
HQ nominates the night's **Lead Zeus** from the same panel.

## After the operation
When the mission ends the board moves to **confirmations**. Staff confirm who played. Only confirmed attendance counts towards promotion points and your MILPAC's operation history, so if you played but show as absent, tell your section lead or raise a [ticket](/tickets).

See also [[rsvp-to-an-operation]] and [[after-action-report]].`,
    },
    {
        _id: 'after-action-report',
        title: 'Filling in the After Action Report',
        category: 'operations',
        audience: 'member',
        order: 5,
        summary: 'Rate the night, write your Sustain / Improve / Fix, and (for 1ICs) your section roll call.',
        paths: ['/operations/*/aar', '/operations/*'],
        keywords: ['aar', 'after action', 'after action report', 'feedback', 'sustain', 'improve', 'fix', 'roll call', '1ic', 'commendation', 'debrief'],
        body: `Once an operation reaches confirmations, an **AAR** tab appears on it and stays there.

## What you fill in
1. **How the night went**: three scales from 1 to 5 for server performance, combat and story, where 3 is a normal night. Only people who attended are asked.
2. **Your write-up**: three short boxes, **Sustain** (what went well), **Improve** (what could be better) and **Fix** (what went wrong).

Each card saves on its own, so you can fill in one part and come back later.

## For 1ICs
Whoever held the top filled slot in a section on the night is that section's 1IC for the AAR. You'll also see your section's **roll call** to confirm, and your members' write-ups, and you can put forward commendations.

## What happens to it
Staff read the AARs by call sign, platoon or company in the AAR Reports view, and can summarise them with the AI when it's turned on.`,
    },
    {
        _id: 'operation-editor-tabs',
        title: 'The operation editor: Brief, Map, Schedule and Staff',
        category: 'operations',
        audience: 'member',
        order: 6,
        departments: ['j2'],
        summary: "The editor's tabs, the staff-only view and how live editing works.",
        paths: ['/operations/*/edit', '/operations/*/schedule', '/operations/*/staff', '/operations/*/map'],
        keywords: ['editor', 'edit operation', 'brief', 'briefing', 'schedule', 'staff view', 'staff orders', 'collaborative', 'map', 'markers'],
        body: `Opening an operation in the editor gives four views of the same operation. Switching between them doesn't reload the page, so nobody loses their place.

- **Brief**: the briefing itself. It's collaborative, so other mission makers' cursors show as they type, and every change saves as you go.
- **Map**: the area of operations, with markers for objectives, routes and positions.
- **Schedule**: when RSVPs open and close and when the operation runs.
- **Staff**: a staff-only view of the same document for orders and notes that members shouldn't see.

When it's ready, publish it from the [J2 operations board](/dashboard/j2). See [[j2-operations-board]] and [[j2-mission-checks]].`,
    },

    // ── Community ─────────────────────────────────────────────────────────────

    {
        _id: 'awards-and-citations',
        title: 'Awards, citations and how to nominate someone',
        category: 'community',
        audience: 'public',
        order: 5,
        summary: 'What members can earn, campaign clasps, and putting someone forward.',
        paths: ['/about/awards'],
        keywords: ['award', 'awards', 'citation', 'citations', 'medal', 'ribbon', 'clasp', 'campaign', 'nominate', 'nomination', 'commendation', 'postage'],
        body: `The [Awards & Citations page](/about/awards) lists every award by category, with its ribbon, who is eligible, the campaign clasp ladder and when an award can be removed.

## Nominating someone
1. Open the award on the [awards page](/about/awards), or open the member's MILPAC and press **Request Award**.
2. Fill in the nomination ticket: who, which award and why.
3. Staff review it. You're told the outcome on the ticket.

You can also propose a brand new award from the same page.

## Physical awards
Some awards can be posted out as physical items. Staff will message you to ask whether you'd like yours sent.`,
    },
    {
        _id: 'rules-and-values',
        title: 'Unit rules and values',
        category: 'community',
        audience: 'public',
        order: 7,
        summary: 'Where the rules, our principles and the callsign list live.',
        paths: ['/about/rules', '/about/values', '/about', '/about/callsigns'],
        keywords: ['rules', 'regulations', 'values', 'principles', 'conduct', 'discipline', 'about', 'callsigns'],
        body: `- [Rules](/about/rules): the unit's rules and regulations. Everyone agrees to these when they join.
- [Principles & Values](/about/values): what we stand for and how we treat each other.
- [Callsigns](/about/callsigns): every platoon and section callsign.
- [About us](/about): the unit's history and when we play.

Breaking the rules can lead to a discipline ticket from staff. If you think someone has broken them, raise a [ticket](/tickets/new) rather than calling it out in public.`,
    },
    {
        _id: 'retired-and-biographies',
        title: 'Retired members and staff biographies',
        category: 'community',
        audience: 'public',
        order: 8,
        summary: 'The memorial wall of past members, and who our staff are.',
        paths: ['/retired', '/bios', '/hof'],
        keywords: ['retired', 'former', 'past members', 'memorial', 'biography', 'bios', 'staff', 'hall of fame', 'hof'],
        body: `- [Retired members](/retired) remembers everyone who has served with ASOT, with their rank and service when they left.
- [Biographies](/bios) introduces the unit's leadership. Staff write their own on their [profile](/me).
- The [Hall of Fame](/hof) recognises members who went above and beyond.

If you left and want to come back, apply again through [Join](/join). J1 will see your earlier service.`,
    },
    {
        _id: 'optional-mods',
        title: 'Optional mods and the mod database',
        category: 'community',
        audience: 'member',
        order: 9,
        summary: 'Choose the optional client mods you run, and look up the unit modlist.',
        paths: ['/optionals', '/dashboard/unit/mods'],
        keywords: ['mods', 'modlist', 'optional', 'optionals', 'qol', 'graphics', 'gfx', 'workshop', 'steam', 'mod database', 'arma'],
        body: `## Optional mods
[Optionals](/optionals) lists the client-side mods you may run on top of the unit modlist, grouped into quality of life, graphics, Zeus and department mods. Switch on the ones you want. Graphics mods ask you to acknowledge a warning first.

## The mod database
The [Mod Database](/dashboard/unit/mods) records every mod that's been looked at, with its status (approved, testing, known issues or rejected), notes, and who tested it and when. Anyone with dashboard access can read it. J2 and J7 keep it up to date, often straight from a mod request ticket.

The modlist for a particular operation is on its attendance post and its operation page.`,
    },
    {
        _id: 'member-directory',
        title: 'The member directory (staff)',
        category: 'community',
        audience: 'staff',
        order: 10,
        summary: 'Finding any member, editing their MILPAC and logging in as them.',
        paths: ['/members', '/members/*', '/dashboard/personnel/all'],
        keywords: ['members', 'directory', 'member list', 'milpac editor', 'edit member', 'login as', 'impersonate', 'personnel'],
        body: `Staff can look up any member in two places: [Members](/members) and [Personnel › Members](/dashboard/personnel/all). Both open the same member panel.

## The member panel
Search by name, pick a member and you'll see their MILPAC with the fields you're allowed to change. Standard fields and restricted fields (rank, awards and the like) are granted separately, so you may only see some of them as editable. Unsaved changes warn you before you switch member.

## Login As
Staff with the impersonation permission can **Login As** a member to see the site as they do. A banner shows while you're impersonating, with a button to return to your own account. Every use is logged.`,
    },

    // ── Your profile ──────────────────────────────────────────────────────────

    {
        _id: 'your-profile-page',
        title: 'Your profile page: bio, timezone and TeamSpeak',
        category: 'profile',
        audience: 'member',
        order: 2,
        summary: 'What you can set on /me, linking TeamSpeak, and logging out everywhere.',
        paths: ['/me'],
        keywords: ['profile', 'me', 'bio', 'biography', 'timezone', 'time zone', 'teamspeak', 'ts', 'link teamspeak', 'log out', 'logout', 'devices', 'token'],
        body: `[Your profile](/me) is your own page on the site.

## Biography
Write a short bio. It shows on your MILPAC and, for staff, on the [biographies](/bios) page.

## Timezone
Your timezone is used for any time you type in, such as a reminder, here and in the Discord bot. It's detected from your browser the first time; change it if it's wrong.

## Linking TeamSpeak
Press **Link TeamSpeak** while you're connected to our TeamSpeak server. The site finds your client, sends a code to you in TeamSpeak, and you type it back in. Once linked, your TeamSpeak groups follow your rank, qualifications and section automatically.

## Log out of all devices
If you signed in somewhere you shouldn't have, **Log Out of All Devices** signs you out everywhere at once. You'll need to sign in again with Discord.`,
    },
    {
        _id: 'member-induction',
        title: 'Your member induction',
        category: 'profile',
        audience: 'member',
        order: 3,
        summary: 'The steps every new member works through, and registering for Selection.',
        paths: ['/me/induction'],
        keywords: ['induction', 'induction pack', 'new member', 'welcome', 'selection', 'steps', 'register interest', 'onboarding'],
        body: `When J1 accepts you, you're sent a Discord message linking to your [induction](/me/induction).

1. Read the welcome and the useful links.
2. Work through each step: attendance, reading orders and your MILPAC, then any others listed. Press **Mark as read** on each one as you go. The progress bar shows how far you are.
3. At the bottom, the next **Selection** is shown in your local time. Press **Register interest** if you'd like to attend.

You can come back to it any time from your profile. See also [[first-steps-as-a-member]].`,
    },
    {
        _id: 'orders-assessments',
        title: 'Orders-writing assessments',
        category: 'profile',
        audience: 'member',
        order: 4,
        summary: 'Writing orders for a course assessment, submitting them and reading your feedback.',
        paths: ['/me/assessments', '/me/assessments/*'],
        keywords: ['assessment', 'assessments', 'orders', 'smeac', 'course', 'trainer', 'feedback', 'submit', 'nco', 'slp'],
        body: `Some courses ask you to write a set of orders. When a trainer sets one, you're notified with a link to it under [My assessments](/me/assessments).

1. Open the assessment. The source material is on one side and the template on the other.
2. Write your orders in the template. They save as you type, so you can leave and come back.
3. Press **Submit** and confirm. After that it's read-only.
4. Your trainer marks it and writes feedback, which appears on the same page.

Write it yourself: trainers check submissions against each other.`,
    },
    {
        _id: 'quizzes',
        title: 'Taking a quiz',
        category: 'profile',
        audience: 'member',
        order: 5,
        summary: 'Assigned quizzes such as the BCT1 quiz: time limits, submitting and results.',
        paths: ['/quiz/*'],
        keywords: ['quiz', 'test', 'bct', 'bct1', 'exam', 'time limit', 'result', 'marking'],
        body: `Quizzes, like the BCT1 confirmation quiz, are assigned to you by J3. You get a notification with the link.

- The time limit starts when you open the quiz, so set aside enough time first.
- Multiple-choice questions are marked automatically. Written answers are marked by a trainer.
- You're notified when it's been marked, with your result.

If something went wrong part-way through (a crash or a lost connection), raise a [ticket](/tickets/new) for J3.`,
    },

    // ── Training ──────────────────────────────────────────────────────────────

    {
        _id: 'training-sessions-and-requests',
        title: 'Signing up for training, and requesting a course',
        category: 'training',
        audience: 'member',
        order: 2,
        summary: 'RSVP as a trainee, register interest in a request, or ask for a course to be run.',
        paths: ['/dashboard/unit/training-hub', '/dashboard/unit/calendar'],
        keywords: ['training', 'session', 'rsvp', 'trainee', 'request', 'request training', 'interest', 'course', 'qualification', 'slots'],
        body: `## Signing up for a session
1. Open the [Training Hub](/dashboard/unit/training-hub) and go to **Events** (scheduled sessions also appear on the [calendar](/dashboard/unit/calendar)).
2. Pick a session and take a **trainee** slot. The slot pills show how many places are left.
3. You'll get reminders before it starts. If you can't make it, take yourself off so someone else can go.

When the trainer completes the session, they submit a ticket and J3 awards the qualification.

## Requesting a course
If there's a course you want and nothing is scheduled, open **Requests** and ask for it. Others can **register interest** on your request, which helps J3 decide what to run. J3 approves the request into a scheduled session, or explains why not.`,
    },
    {
        _id: 'running-a-training-session',
        title: 'Running a training session (trainers)',
        category: 'training',
        audience: 'member',
        order: 3,
        summary: 'Booking a session, running it, and submitting the completion ticket.',
        paths: ['/dashboard/unit/training-hub', '/dashboard/unit/allstaff-calendar', '/dashboard/unit/training-hub/course/*'],
        keywords: ['trainer', 'run training', 'create event', 'book', 'schedule training', 'complete', 'training ticket', 'pass', 'fail', 'sit in', 'clash'],
        body: `If you're a qualified trainer you can book and run sessions.

## Booking
1. In the [Training Hub](/dashboard/unit/training-hub) **Events** view, create an event for the course. The end time fills in from the course's length.
2. The form warns you if the time clashes with a mission, another training or a calendar event.
3. Events from trainers who aren't J3 leads wait for J3 approval before they show on the calendar.

## Running it
Use the course's trainer documents, linked from its page in the hub. Take attendance on the event.

## Completing it
Mark the session complete and submit the **training ticket**: each attendee as trainer, trainee or sit-in, pass or fail, and whether they earn the qualification and billet points. J3 checks and approves it, and the qualifications are added to MILPACs.`,
    },
    {
        _id: 'training-docs',
        title: 'Training documents and guides',
        category: 'training',
        audience: 'member',
        order: 4,
        summary: 'The training document library, course guides and how docs are approved.',
        paths: ['/dashboard/unit/training-docs', '/dashboard/unit/training-docs/*', '/dashboard/unit/training-guides', '/dashboard/unit/training-hub/guide/*'],
        keywords: ['training docs', 'documents', 'guide', 'guides', 'library', 'folders', 'manual', 'reference'],
        body: `- **[Training Docs](/dashboard/unit/training-docs)** is a library of reference documents in folders. Search it, or browse the folders. J3 manages it.
- **Course guides** belong to a course in the [Training Hub](/dashboard/unit/training-hub). Each course has slots for its documents (the trainer guide, the information sheet and so on); open the course to find them.
- Trainers can propose a document for a course. J3 approves it before it shows to everyone.

See [[training-hub]] and [[sops]].`,
    },

    // ── Tickets ───────────────────────────────────────────────────────────────

    {
        _id: 'ticket-types',
        title: 'Which kind of ticket to raise',
        category: 'tickets',
        audience: 'member',
        order: 3,
        summary: 'Requests, bugs, missions, campaigns, feedback, complaints and awards: which goes where.',
        paths: ['/tickets', '/tickets/new'],
        keywords: ['ticket', 'tickets', 'request', 'bug', 'mission idea', 'campaign idea', 'feedback', 'complaint', 'award', 'nomination', 'which', 'category', 'department'],
        body: `When you [raise a ticket](/tickets/new) you pick what it's about, and that decides which department gets it:

- **Request**: a mod request or a feature request.
- **Bug report**: something isn't working in Arma, Discord, the website or the MILPAC system. See [[reporting-a-website-bug]].
- **Mission & Campaign**: pitch a mission or campaign idea to J2 Mission Making.
- **Unit feedback**: private feedback about how the unit runs, sent straight to J4.
- **Complaint**: an issue involving a member. Complaints are handled privately.
- **Awards & Citations**: nominate a member or propose a new award. See [[awards-and-citations]].

Staff can transfer a ticket to another department if it landed in the wrong place, so don't worry about picking perfectly. Follow it on [your tickets](/tickets).`,
    },

    // ── Dashboard & staff tools ───────────────────────────────────────────────

    {
        _id: 'department-pages',
        title: 'How a department page is laid out',
        category: 'dashboard',
        audience: 'member',
        order: 2,
        summary: 'Main tabs, quick links, and the Admin, Calendar and Activity Logs views.',
        paths: DEPT_PAGES,
        keywords: ['department', 'tabs', 'admin', 'calendar', 'activity log', 'logs', 'quick links', 'leadership', 'members', 'pin'],
        body: `Every department page (J1 to J7) works the same way.

## The main tabs
The department's own tools, such as Applications for J1 or the Board for J7. Pin any tab to your sidebar with its pin icon.

## Quick links
The row of icons above the tabs links to the department's other tools and documents. Leads choose what's there and who sees each link.

## The header buttons
- **Admin**: department members and leadership, quick-link settings, meetings, tickets and the lead-only tools.
- **Calendar**: the department's own calendar.
- **Activity Logs**: what's been done in the department, by whom and when.

## Members and leadership
Under Admin, leads see the department's members, give them department roles, and fill the Leader, 2IC and 3IC slots.`,
    },
    {
        _id: 'department-tickets',
        title: "Handling your department's tickets",
        category: 'dashboard',
        audience: 'member',
        order: 3,
        summary: 'Find tickets sent to your department, update their status, and transfer them.',
        paths: DEPT_PAGES,
        tutorial: 'dept-tickets',
        keywords: ['department tickets', 'ticket status', 'transfer', 'resolve', 'close', 'triage'],
        body: `Tickets members raise about your department land in its **Tickets** tab, under **Admin** on the department page.

1. Filter by category and status to find the ones that need you.
2. Open a ticket to read it and reply.
3. Move its status along as you work on it, for example from **Open** to **In review**, **Implementing** and **Implemented**, or to **Resolved**, **Denied**, **No action required** or **Closed**. The person who raised it is notified each time.
4. If it belongs to another department, **Transfer** it. It disappears from your list and appears in theirs.

Leads can manage every ticket; members can work the ones assigned to them. Press **Start the walkthrough** above for a guided run-through on a practice ticket.`,
    },
    {
        _id: 'calendars',
        title: 'The unit and staff calendars',
        category: 'dashboard',
        audience: 'member',
        order: 4,
        summary: 'Reading the calendars, filtering by department, and setting reminders.',
        paths: ['/dashboard/unit/calendar', '/dashboard/unit/allstaff-calendar'],
        keywords: ['calendar', 'events', 'schedule', 'reminder', 'reminders', 'ops only', 'staff calendar', 'department colours', 'add event'],
        body: `## The unit calendar
The [Calendar](/dashboard/unit/calendar) shows every department's events in one place, coloured by department.

- Click a department in the legend to show only theirs; click again to bring the rest back.
- **Ops Only** hides everything but operations.
- Switch between month, week, day and agenda views.
- Open an event to see its details and add a **reminder**. You're notified (and DM'd, if you've allowed it) at the time you chose.

## The staff calendar
The [Staff Calendar](/dashboard/unit/allstaff-calendar) is for events that concern all staff. Trainers can add training sessions straight from a course here.

Staff can add events to the unit calendar with **Add Event**. Each department also has its own calendar on its page.`,
    },
    {
        _id: 'tasks',
        title: 'Tasks: deadlines, extensions and lockout',
        category: 'dashboard',
        audience: 'staff',
        order: 5,
        summary: 'Assigning tasks, asking for more time, and why overdue tasks can lock you out.',
        paths: ['/dashboard/tasks'],
        keywords: ['task', 'tasks', 'assign', 'deadline', 'due', 'overdue', 'extension', 'reassign', 'delete', 'lockout', 'locked out', 'chase'],
        body: `[Tasks](/dashboard/tasks) are jobs staff assign each other with a due date.

## Your tasks
- Mark a task **complete** when it's done. Whoever set it is told.
- Can't make the deadline? **Request an extension** from the task. Whoever set it approves or denies it.
- You can also ask for a task to be **reassigned** or **deleted** if it no longer makes sense.

You're reminded as the deadline gets close, and chased when it's overdue.

## Assigning tasks
Press **New Task**, pick a person or a role, write what's needed and set the due date. Which roles you can assign to depends on your department.

## Lockout
For some staff groups, an overdue task you haven't acted on locks you out of the rest of the dashboard until you deal with it: complete it, or ask for an extension. Too many open tasks at once also alerts your leads.`,
    },
    {
        _id: 'meetings',
        title: 'Department meetings',
        category: 'dashboard',
        audience: 'member',
        order: 6,
        summary: 'RSVPs, notes, action items, attachments and confirming attendance.',
        paths: [...DEPT_PAGES, '/dashboard/meeting/*'],
        keywords: ['meeting', 'meetings', 'rsvp', 'notes', 'minutes', 'agenda', 'attendance', 'loa', 'action items', 'attachments', 'transfer', 'lock'],
        body: `Each department's meetings are under **Admin › Meetings** on its page.

## Before the meeting
You're notified when a meeting is set. RSVP **Attending**, **Not Attending** or **LOA** from the notification or the meeting itself.

## During and after
- **Notes**: the meeting's minutes, edited by leads.
- **Tasks**: action items from the meeting, each with an owner and a status.
- **Attachments**: images, videos, PDFs and links.
- Leads **lock** the notes when they're final and mark the meeting **complete**.
- After it's complete, leads confirm who actually attended.

A meeting can be **transferred** to another department when it belongs to them; it then shows there as imported. Any meeting can be linked directly with its own page.`,
    },
    {
        _id: 'staff-ticket-queue',
        title: 'The staff ticket queue',
        category: 'dashboard',
        audience: 'staff',
        order: 7,
        summary: 'Move requests, discipline, promotions, discharges and other staff tickets.',
        paths: ['/dashboard/unit/tickets'],
        keywords: ['staff tickets', 'move request', 'discipline', 'promotion', 'discharge', 'performance report', 'department membership', 'approve', 'reject', 'queue'],
        body: `Staff tickets are separate from the tickets members raise. They record decisions about members, and they're handled in the [staff ticket queue](/dashboard/unit/tickets).

Kinds of staff ticket:
- **Move request**: moving a member to another section or to the reservists.
- **Discipline**: a rule breach, with points deducted.
- **Promotion** and **qualification** changes.
- **Discharge**, raised by J4.
- **Performance report**.
- **Department membership** changes, kept as an audit record.

You only see the kinds you're allowed to act on. Open one to read it, then **Approve** or **Reject** it with any details it needs. Approving applies the change.`,
    },
    {
        _id: 'all-staff-tools',
        title: 'All Staff: move requests, discipline and AAR reports',
        category: 'dashboard',
        audience: 'staff',
        order: 8,
        summary: 'Raising staff tickets, objective suggestions and reading AARs across the unit.',
        paths: ['/dashboard/personnel/all-staff', '/dashboard/personnel/hq-staff'],
        keywords: ['all staff', 'move request', 'discipline', 'performance report', 'objective suggestions', 'aar reports', 'aar', 'summarise', 'commendation'],
        body: `[All Staff](/dashboard/personnel/all-staff) is where staff raise tickets about members and read the unit's AARs.

- **Move Requests**: pick a member and where they're going (a vacant slot, or the reservists). If you have the authority it applies at once; otherwise it goes to whoever must approve it. Requests waiting for you show at the top.
- **Discipline** and **Performance Reports**: raise one against a member, and follow the ones you've raised.
- **Objective Suggestions**: ideas for mission objectives, passed to J2.
- **AAR Reports**: choose a mission, a campaign or the last 6 or 12 months, and a level (call sign, platoon or company), to read everyone's Sustain / Improve / Fix. With AI on, **Summarise** condenses each unit's entries. Commendations can be copied as a ready-made Discord post.`,
    },
    {
        _id: 'orbat-manager',
        title: 'Managing the ORBAT (staff)',
        category: 'dashboard',
        audience: 'staff',
        order: 9,
        summary: 'Sections and positions, assigning members, roles and what they grant.',
        paths: ['/dashboard/orbat'],
        keywords: ['orbat', 'orbat manager', 'section', 'position', 'slot', 'assign', 'reservist', 'roles', 'roles manager', 'chain of command', 'member sync', 'permissions', 'discord roles', 'teamspeak groups'],
        body: `The [ORBAT manager](/dashboard/orbat) is the editable version of the public [ORBAT](/orbat).

## Structure and members
Each tab is a company, platoon or group, broken into sections. Drag positions to reorder them, choose each position's role, and assign members to positions. Click a member to open their full member panel.

## Roles
**Roles** (J4) opens the Roles Manager:
- **ORBAT Roles** are the job titles positions hold. Each grants Discord roles, TeamSpeak groups and site permissions to whoever holds it.
- **Department Roles** do the same for department membership.
- **Permissions Explorer** shows who can do what, and why.
- **Member Sync** compares everyone's actual Discord roles and TeamSpeak groups with what their positions should give them, and fixes the differences.

**Chain of Command** draws the roles as a tree you can rearrange by dragging.`,
    },

    // ── J1 Recruitment ────────────────────────────────────────────────────────

    {
        _id: 'j1-recruit-member',
        title: 'J1: running a recruit session',
        category: 'j1',
        audience: 'member',
        departments: ['j1'],
        order: 2,
        summary: 'The Recruit Member wizard, the live applicant screen, and what happens at the end.',
        paths: ['/dashboard/j1', '/recruit-session/*'],
        keywords: ['recruit', 'recruit member', 'interview', 'wizard', 'recruit session', 'applicant', 'live session', 'bct availability', 'joining agreement', 'teamspeak', 'tfar', 'induction pack'],
        body: `**Recruit Member** on the [J1 page](/dashboard/j1) walks you through an interview step by step: the checklist, introduction, background, availability, roles, BCT availability, the ORBAT, the rules and joining agreement, the decision, then the TeamSpeak, TFAR and Discord admin steps.

## The live applicant screen
Start a **recruit session** and give the applicant the link. Their screen follows yours, so they see what you're talking about and answer questions on their side.

## Saving and finishing
Your progress saves as you go, so you can stop and pick it up later. On the last step, **accept**, **pend** or **decline**. Accepting creates the application and offers to send the **Induction Pack** straight away.

See [[j1-applications]] and [[j1-induction-pack]].`,
    },
    {
        _id: 'j1-applications',
        title: 'J1: reviewing applications',
        category: 'j1',
        audience: 'member',
        departments: ['j1'],
        order: 3,
        tutorial: 'j1-applications',
        summary: 'Statuses, recruiters, recommendations, the lead decision and returning members.',
        paths: ['/dashboard/j1'],
        keywords: ['application', 'applications', 'review', 'recruiter', 'recommend', 'accept', 'reject', 'send back', 'returning member', 'discord link', 'pending', 'reviewing'],
        body: `The **Applications** tab lists every application. Search, sort, and filter by status: pending, reviewing, returned, accepted or rejected.

## Reviewing one
1. Open an application. Assign a **recruiter** and a review deadline.
2. The recruiter reads it and makes a **recommendation**: approve, deny or pend.
3. A J1 lead makes the **final decision**: accept, reject, or send it back to the applicant to fix something.

## Returning members
Someone who served before is flagged as a **returning member**. J4 checks their history before they're accepted.

## After accepting
Link their Discord account if it wasn't matched automatically, and send the **Induction Pack**. Its status (sent, opened, in progress, completed) shows on the application.

Press **Start the walkthrough** above for a guided run-through with a practice application.`,
    },
    {
        _id: 'j1-induction-pack',
        title: 'J1: the Induction Pack',
        category: 'j1',
        audience: 'member',
        departments: ['j1'],
        order: 4,
        summary: "What new members are sent, how to send it, and editing it.",
        paths: ['/dashboard/j1'],
        keywords: ['induction', 'induction pack', 'dm', 'welcome', 'onboarding', 'selection', 'steps', 'send', 'resend'],
        body: `The Induction Pack is the Discord message and [induction page](/me/induction) every new member gets.

## Sending it
Send it from the recruit wizard's finish screen, or from the application. **Resend** if they lost it. The application shows whether it's been opened, how many steps they've done, and whether they've registered interest in Selection.

## Editing it
**Admin › Induction Pack** holds the message, its image, the welcome text, useful links, the Selection section and the list of steps. Every J1 member can read it; leads edit it. The message can use \`{name}\`, \`{selectionDate}\`, \`{inductionUrl}\`, \`{selectionUrl}\` and \`{calendarUrl}\`, filled in when it's sent. The preview shows it with the real next Selection.`,
    },
    {
        _id: 'j1-admin-tools',
        title: 'J1: mastersheet, statistics and lead tools',
        category: 'j1',
        audience: 'member',
        departments: ['j1'],
        order: 5,
        summary: 'The J1 mastersheet, recruitment statistics, the TFAR plugin and the recruit video.',
        paths: ['/dashboard/j1'],
        keywords: ['mastersheet', 'statistics', 'stats', 'recruiter leaderboard', 'tfar', 'plugin', 'recruit video', 'bct availability', 'discharge'],
        body: `- **Mastersheet**: every accepted member, from their application, with discharge details for anyone who has left.
- **Admin › Statistics**: applications and acceptances per month, roles and regions applicants come from, and a recruiter leaderboard for the last 30 or 90 days or all time.
- **Admin › TFAR Plugin** (leads): upload the TFAR TeamSpeak plugin recruits download.
- **Admin › Recruit Video** (leads): the video shown to applicants.
- **BCT availability**: recruiters mark when they can run BCT, from the recruit wizard; these show on J3's calendar.`,
    },

    // ── J2 Mission Making ─────────────────────────────────────────────────────

    {
        _id: 'j2-operations-board',
        title: 'J2: the operations board',
        category: 'j2',
        audience: 'member',
        departments: ['j2'],
        order: 2,
        summary: 'Creating, duplicating and filing operations, campaigns, templates and the recycle bin.',
        paths: ['/dashboard/j2'],
        keywords: ['operations board', 'create operation', 'new operation', 'duplicate', 'template', 'templates', 'campaign', 'campaign builder', 'recycle bin', 'restore', 'delete operation', 'status'],
        body: `The **Operations** tab on the [J2 page](/dashboard/j2) is where operations are made and managed.

- **Views**: a list of operations, or campaigns with their missions. Filter by status (In Development, Upcoming, Active, Completed) and by campaigns or single missions.
- **New operation**: starts In Development, visible only to J2 and staff. Or start from a **template**, or **duplicate** an existing operation (all of it, or just some parts).
- **Templates**: save any operation as a template with the bookmark icon.
- **Campaigns**: build a campaign by dragging missions onto its days, and link or unlink an operation from a campaign.
- **Recycle bin**: deleted operations go here and can be restored. An undo button appears right after a delete.

Open an operation to write it. See [[operation-editor-tabs]].`,
    },
    {
        _id: 'j2-mission-checks',
        title: 'J2: mission checks',
        category: 'j2',
        audience: 'member',
        departments: ['j2'],
        order: 3,
        summary: 'The check milestones before an operation, reviewers, and requesting a check.',
        paths: ['/dashboard/j2'],
        keywords: ['mission check', 'mission checks', 'dev check', 'review', 'reviewer', 'overdue', 'milestone', 'request check', 'unavailability'],
        body: `Every operation in development has a set of **checks** counting down to its date, so problems are caught early.

- The **Mission Checks** tab lists them: active, overdue, completed or all. Expand an operation to see each check's due date and reviewer.
- J2 leads **assign a reviewer** to a check. The reviewer gets a task and a notification.
- Overdue checks are escalated automatically.
- To ask for a check yourself, add a **mission check request** on the J2 calendar against the operation.

J2 leads can also block out **unavailability** on the J2 calendar, when nobody is free to review.`,
    },
    {
        _id: 'j2-workspace-and-lore',
        title: 'J2: workspace, Mission Bible and Enemy Doctrine',
        category: 'j2',
        audience: 'member',
        departments: ['j2'],
        order: 4,
        summary: 'Your files and drafts, the unit lore, objective ideas and faction doctrine.',
        paths: ['/dashboard/j2'],
        keywords: ['workspace', 'members workspace', 'files', 'drafts', 'docs', 'mission bible', 'lore', 'objective suggestions', 'enemy doctrine', 'faction', 'intel images', 'era options', 'templates'],
        body: `- **Members Workspace**: each mission maker's own files, shared documents (edited live, with version history you can restore) and operations. Leads can look across everyone's.
- **Mission Bible**: the unit's setting and lore, so operations stay consistent.
- **Objective Suggestions**: objective ideas sent in by staff.
- **Enemy Doctrine**: a library of factions and how they fight. New and changed doctrine goes to the J2 Lead for review.

Under **Admin**: **Intel Images** (pictures for briefings), **ERA Options** (the setting choices in the editor, leads only) and **Templates**.`,
    },

    // ── J3 Training ───────────────────────────────────────────────────────────

    {
        _id: 'j3-training',
        title: 'J3: the training department pages',
        category: 'j3',
        audience: 'member',
        departments: ['j3'],
        order: 1,
        summary: 'Training Hub, tickets, calendar, requests, records and the master sheet.',
        paths: ['/dashboard/j3'],
        keywords: ['j3', 'training', 'training hub', 'training tickets', 'training calendar', 'training requests', 'training records', 'master sheet', 'course'],
        body: `The [J3 page](/dashboard/j3) has six main tabs:

- **Training Hub**: the course catalogue. J3 leads add and edit courses (category, billet points, length, server, mods, prerequisites, how many trainers and trainees, documents and cover image).
- **Training Tickets**: completion tickets from trainers, waiting for approval. See [[j3-training-tickets]].
- **Training Calendar**: scheduled sessions, BCT and quiz availability.
- **Training Requests**: courses members have asked for.
- **Training Records**: every past session. See [[j3-records-and-assessments]].
- **Master Sheet**: every member against every qualification.

Under **Admin**: meetings, tickets, and the **Selection Countdown Post** (leads), which posts a countdown to the next Selection in Discord.`,
    },
    {
        _id: 'j3-training-tickets',
        title: 'J3: approving training tickets',
        category: 'j3',
        audience: 'member',
        departments: ['j3'],
        order: 2,
        summary: 'Checking a completed session and awarding qualifications and points.',
        paths: ['/dashboard/j3'],
        keywords: ['training ticket', 'approve', 'reject', 'amend', 'qualification', 'billet points', 'pass', 'fail', 'trainer', 'trainee'],
        body: `When a trainer finishes a session they submit a **training ticket**. It lands in **Training Tickets**.

1. Open the ticket. Each attendee is listed as trainer, trainee or sit-in, with pass or fail and whether they earn the qualification and billet points.
2. Check it against the session.
3. **Approve** to award everything, **Reject** with a reason, or **Request amendments** to send it back to the trainer.

Approved qualifications appear on each member's MILPAC and the master sheet.`,
    },
    {
        _id: 'j3-records-and-assessments',
        title: 'J3: records, quizzes and assessments',
        category: 'j3',
        audience: 'member',
        departments: ['j3'],
        order: 3,
        summary: 'Training records, assigning and marking quizzes, and orders assessments.',
        paths: ['/dashboard/j3', '/dashboard/j3/training-records/*', '/dashboard/quiz/review/*', '/dashboard/unit/training-hub/assessment/*'],
        keywords: ['training records', 'records', 'quiz', 'assign quiz', 'mark quiz', 'review quiz', 'assessment', 'orders assessment', 'documents', 'import'],
        body: `## Training records
**Training Records** lists every session by year, course and status. Open one for its attendees and documents. The Documents column counts orders assessments filed for that session.

## Quizzes
Assign a quiz (such as BCT1) to a recruit, with a different time limit if needed (you'll be asked why). Multiple choice marks itself; open the attempt to mark written answers.

## Orders assessments
Trainers set an orders-writing assessment from the course's **Assessment Orders** page. The trainee writes it under [My assessments](/me/assessments); the trainer marks it and writes feedback there.`,
    },

    // ── J4 Administration ─────────────────────────────────────────────────────

    {
        _id: 'j4-administration',
        title: 'J4: administration overview',
        category: 'j4',
        audience: 'member',
        departments: ['j4'],
        order: 1,
        summary: 'The HQ Mastersheet, community tickets, tools and the admin area.',
        paths: ['/dashboard/j4'],
        keywords: ['j4', 'administration', 'mastersheet', 'tickets', 'tools', 'admin', 'backups', 'teamspeak', 'ai admin', 'award postage', 'logs'],
        body: `The [J4 page](/dashboard/j4) has three main tabs:

- **Mastersheet**: the HQ Mastersheet. See [[j4-mastersheet]].
- **Tickets**: every community ticket across the unit, to triage and transfer.
- **Tools**: discharges, reinstatements, imports, developer modes and website settings. See [[j4-tools]].

Under **Admin**: meetings across every department, **Backups**, **TeamSpeak**, **AI Admin** and **Awards and Citation Postage**. **Logs** in the header shows activity and errors across the whole site.`,
    },
    {
        _id: 'j4-mastersheet',
        title: 'J4: the HQ Mastersheet',
        category: 'j4',
        audience: 'member',
        departments: ['j4'],
        order: 2,
        summary: 'The billet roster, leaving history, denied applications, discipline and the recycle bin.',
        paths: ['/dashboard/j4'],
        keywords: ['mastersheet', 'billet', 'roster', 'leaving history', 'denied applications', 'discipline', 'recycle bin', 'pending changes', 'emails'],
        body: `The Mastersheet is the unit's master record of members.

- **Billet**: one row per member with their qualifications and awards as badges. Edit fields in place, or open a member's full panel.
- **Leaving history**, **Denied applications** and **Discipline**: the records of each.
- **Recycle bin**: deleted rows, which can be restored.

Edits are held as **pending changes** until you review and commit them together, so a slip can be caught before it's saved.`,
    },
    {
        _id: 'j4-tools',
        title: 'J4: tools and website settings',
        category: 'j4',
        audience: 'member',
        departments: ['j4'],
        order: 3,
        summary: 'Discharging and reinstating members, imports, developer modes and site settings.',
        paths: ['/dashboard/j4', '/dashboard/j4/website-settings', '/dashboard/j4/import'],
        keywords: ['tools', 'discharge', 'reinstate', 'import', 'developer mode', 'dev mode', 'website settings', 'notification policy', 'task limit', 'lockout', 'recruitment settings', 'certificate signatory'],
        body: `## Tools
- **Discharge** a member: choose the type, the reason and whether they may rejoin. This raises a discharge ticket.
- **Reinstate** a discharged member, choosing what to bring back from their record: qualifications, awards, trainings, campaign medals and attendance.
- **Import**: bring in records from spreadsheets.
- **Discord** and **TeamSpeak developer mode**: stop the site from changing real roles or sending real messages while testing.

## Website settings
[Website settings](/dashboard/j4/website-settings) holds:
- which notifications are forced on or off, on the site and in Discord;
- task limits and the overdue-task lockout per staff group;
- the public recruitment info page;
- which HQ position signs certificates.`,
    },
    {
        _id: 'j4-backups-and-systems',
        title: 'J4: backups, TeamSpeak, AI and award postage',
        category: 'j4',
        audience: 'member',
        departments: ['j4'],
        order: 4,
        summary: 'The admin area: restoring backups, TeamSpeak groups, AI budgets and posting awards.',
        paths: ['/dashboard/j4'],
        keywords: ['backups', 'backup', 'restore', 'revert', 'teamspeak', 'server groups', 'snapshots', 'ai', 'ai admin', 'budget', 'award postage', 'postage', 'physical awards'],
        body: `- **Backups**: the database and media are backed up every hour and thinned out over time automatically. Take one now, download one, or revert to one (reverting needs the separate restore permission).
- **TeamSpeak**: see who's online, manage a client's server groups, take and restore server snapshots, and link campaigns, awards, ranks and qualifications to their TeamSpeak groups.
- **AI Admin**: turn AI features on or off and set spending budgets.
- **Awards and Citation Postage**: who wants physical awards posted, and monthly lists of what to send. Only the people responsible for postage see it.`,
    },

    // ── J5 Media ──────────────────────────────────────────────────────────────

    {
        _id: 'j5-media',
        title: 'J5: the media console',
        category: 'j5',
        audience: 'member',
        departments: ['j5'],
        order: 1,
        summary: 'The media library, reviewing submissions, the featured rail, Screenshot of the Month and tags.',
        paths: ['/dashboard/j5', '/gallery/review'],
        keywords: ['j5', 'media', 'gallery', 'submissions', 'review', 'featured', 'screenshot of the month', 'sotm', 'tags', 'caption', 'operation', 'upload'],
        body: `The [J5 page](/dashboard/j5) runs the [gallery](/gallery).

- **Media**: the whole library, browsable by year, campaign, operation and mission. Saved views find what needs work: not linked to an operation, no caption, videos. Select items to caption, tag or move them in bulk; double-click to view one full size.
- **Submissions**: what members send in. Accept, correct or reject each one; the member is told.
- **Featured**: choose and order the photographs on the public featured rail.
- **Screenshot of month**: set this month's screenshot, with credit and operation.
- **Tags**: the tag list members and J5 choose from.

Submitting and reviewing are separate permissions, granted in the Roles Manager.`,
    },

    // ── J6 Game Masters ───────────────────────────────────────────────────────

    {
        _id: 'j6-zeus-notes',
        title: 'J6: Zeus notes and running missions',
        category: 'j6',
        audience: 'member',
        departments: ['j6'],
        order: 1,
        summary: 'Notes for each operation, and signing on as Lead Zeus.',
        paths: ['/dashboard/j6'],
        keywords: ['j6', 'zeus', 'zeus notes', 'game master', 'gm', 'lead zeus', 'curator', 'notes'],
        body: `## Zeus notes
**Zeus Notes** on the [J6 page](/dashboard/j6) lists every operation. Pick one (search if you need to) to read or write the Game Masters' notes for it: what to spawn, when, and anything the mission maker wants handled live. A dot marks operations that already have notes.

## Lead Zeus
HQ nominates the night's **Lead Zeus** on the operation's attendance board. See [[attendance-board]].

Meetings, tickets and the department calendar are under **Admin** and **Calendar** as on every department page.`,
    },

    // ── J7 Community Development ──────────────────────────────────────────────

    {
        _id: 'j7-board',
        title: 'J7: the development board',
        category: 'j7',
        audience: 'member',
        departments: ['j7'],
        order: 1,
        summary: 'Columns, cards, assignees and linking a card to a task.',
        paths: ['/dashboard/j7'],
        keywords: ['j7', 'board', 'kanban', 'trello', 'card', 'cards', 'column', 'columns', 'assign', 'task', 'drag'],
        body: `The **Board** on the [J7 page](/dashboard/j7) tracks J7's projects.

- Any J7 member can add, edit, move and delete **cards**. Drag a card to another column as it progresses.
- A card can have a description, an **assignee** (who is notified) and a linked **task**, so finishing the work and finishing the task stay together.
- Leads add, rename, reorder and delete **columns**.`,
    },
]
