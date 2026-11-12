/**
 * The help wiki's starter articles. These ship with the code so the wiki is
 * never empty, but J7 owns them from the first edit on: saving an article (or
 * approving a suggested edit) writes a copy to `help_articles` under the same
 * slug, and that copy wins from then on (`lib/help/store.ts`). Changing the
 * text here only reaches readers for articles nobody has edited yet.
 *
 * Written in the wiki's Markdown dialect (`lib/help/markdown.ts`). Link pages
 * with `[text](/path)` and other articles with `[[slug]]`.
 */

import { SITE_ARTICLES } from './articles-site'

type Seed = Omit<HelpArticle, 'version' | 'updatedAt' | 'updatedById' | 'updatedByName'>

/** Every built-in guide: the starters below, then the rest of the site (`articles-site.ts`). */
export const BUILT_IN_ARTICLES: Seed[] = [

    // ── Getting started ───────────────────────────────────────────────────────

    {
        _id: 'using-the-help-wiki',
        title: 'Using this help wiki',
        category: 'getting-started',
        audience: 'public',
        order: 1,
        summary: 'How the ? button works, how to search, ask a question, and suggest a fix.',
        paths: ['/help'],
        keywords: ['help', 'wiki', 'guide', 'question mark', 'search', 'suggest', 'edit', 'bug', 'ask', 'ai', 'faq', 'contents', 'this page'],
        body: `The **?** button in the bottom-right corner of every page opens this guide. You can also press the **?** key anywhere on the site (when you aren't typing in a box).

## It starts with the page you're on
When you open it, the panel shows:
- **You're on**: the page you're looking at, with a box to **ask about this page**.
- **Guides for this page**: the guides written about it.
- **Common questions on this page**: what other people have asked here, with the answers.
- **Most asked**: the questions asked most across the whole site.

## Finding an answer
- **Search** looks through every guide's title, keywords and text, and questions asked before, as you type.
- **Browse topics** shows every guide grouped by section.
- Open [the full wiki](/help) for a contents list of everything down the left, with each guide's chapters.

You only see guides for what you have access to. Department guides show to that department's members.

## Asking a question
Signed-in members can use the **Ask** tab to put a question to the site's AI assistant. It answers from the guides you can read and links the ones it used. "This page" means the page you're on.

Every question asked goes into the **living FAQ**: questions many people ask rise to the top. If the assistant can't answer, or your question sounds like something on the site is broken, it passes it to J7 by itself and says so. You can still press **Send to J7** for anything else.

> **Note:** The assistant can be switched off or reach its budget. When it is, the Ask tab says so, and you can still send your question to J7.

## Fixing a guide
Every guide has **Suggest an edit** and **Report a bug** buttons at the bottom. Edits go to J7 (Community Development), who approve them before they appear. You get a notification when your suggestion is reviewed.`,
    },
    {
        _id: 'joining-asot',
        title: 'How to join ASOT',
        category: 'getting-started',
        audience: 'public',
        order: 2,
        summary: 'What you need before you apply, and how the application works.',
        paths: ['/join', '/about', '/about/faq', '/'],
        keywords: ['join', 'enlist', 'apply', 'application', 'recruit', 'requirements', 'age', 'microphone', 'discord'],
        body: `ASOT is an Australian and New Zealand ARMA 3 milsim unit. Anyone who meets the requirements below is welcome to apply.

## Before you apply
- You're **17 or older**, or a current member vouches for you.
- You have a **legitimate copy of ARMA 3**. Our servers run BattlEye, and pirated copies or cheats mean an immediate ban.
- You have a **working microphone**.
- You aren't a member of another ARMA 3 milsim or realism group. RP communities are fine; check with staff if you're unsure.

## How to apply
1. Press **Enlist** at the top of the site. It takes you to our Discord server.
2. Follow the recruitment channel's instructions. J1 (Recruitment) will look after you from there.
3. J1 takes you through a recruit session that covers the rules, the ORBAT and getting set up.

## After you're accepted
Sign in to the site with Discord using the account icon at the top right. Your [profile](/me) then shows your record, and [your induction](/me/induction) walks you through your first steps.

Read the [rules](/about/rules) and the [FAQ](/about/faq) before you apply.`,
    },
    {
        _id: 'signing-in',
        title: 'Signing in and out',
        category: 'getting-started',
        audience: 'public',
        order: 3,
        summary: 'The site signs you in with Discord. Here is how, and how to sign out everywhere.',
        paths: ['/login', '/me', '/dashboard/profile'],
        keywords: ['login', 'log in', 'sign in', 'discord', 'logout', 'sign out', 'account', 'devices', 'session'],
        body: `The site doesn't have its own passwords. You sign in with your **Discord** account.

## Signing in
1. Press the account icon at the top right of any page, or go to [the sign-in page](/login).
2. Approve the request in Discord.
3. You come back signed in. Members see a **Dashboard** button, everyone else sees **Profile**.

Your access on the site comes from your place in the unit, so make sure you sign in with the Discord account you use in the ASOT server.

## Signing out
Use the account menu at the top right. To sign out of **every** device at once (for example on a shared computer), use **Log out of all devices** on [your profile](/me).

## Something looks wrong?
If your rank, callsign or access looks out of date, sign out and back in. If it's still wrong, see [[reporting-a-website-bug]].`,
    },
    {
        _id: 'first-steps-as-a-member',
        title: 'Your first steps as a new member',
        category: 'getting-started',
        audience: 'member',
        order: 4,
        summary: 'Induction, linking TeamSpeak, setting your timezone, and where to find things.',
        paths: ['/me', '/me/induction', '/dashboard/profile'],
        keywords: ['new', 'induction', 'recruit', 'first', 'start', 'teamspeak', 'timezone', 'selection', 'welcome'],
        body: `Welcome to ASOT. Here's what to do first.

## 1. Work through your induction
Open [your induction](/me/induction). Each step explains part of how the unit runs (attendance, orders, your MILPAC and more). Mark each one as read when you're done. The last section shows the next **Selection** in your own time zone, with a button to register interest.

## 2. Set up your profile
On [your profile](/me):
- Check your **timezone**. It's detected for you, and it's used for every time the site shows you and for reminders you set.
- **Link TeamSpeak** so your TeamSpeak groups follow your place in the ORBAT.
- Write a short **biography** if you'd like one on your MILPAC.

## 3. Find your way around
- [Operations](/operations) lists upcoming missions. See [[rsvp-to-an-operation]].
- The [ORBAT](/orbat) shows where you sit in the unit.
- [Your MILPAC](/milpacs) is your service record. See [[your-milpac]].
- The [dashboard](/dashboard) holds the calendar, SOPs, the training hub and tickets.

If you get stuck, press **?** on any page, or ask in the Ask tab.`,
    },

    // ── Operations ────────────────────────────────────────────────────────────

    {
        _id: 'rsvp-to-an-operation',
        title: 'RSVP to an operation',
        category: 'operations',
        audience: 'member',
        order: 1,
        summary: 'Mark yourself attending or not attending, and confirm afterwards.',
        paths: ['/operations', '/operations/*'],
        keywords: ['rsvp', 'attend', 'attending', 'not attending', 'sign up', 'slot', 'mission', 'operation', 'confirm', 'attendance'],
        body: `Every main operation has an attendance panel where you say whether you're coming.

## Before the operation
1. Open [Operations](/operations) and pick the operation.
2. When RSVPs are open, choose **Attending** or **Not Attending**. You can change your answer until RSVPs close.
3. Your section leader places you in a slot on the roster. Reservists are allocated from the pool.

RSVPs open and close on a schedule set for each operation, and the page shows which stage it's at.

## After the operation
Once the mission is over, attendance moves to **confirmation**. Staff confirm who actually played. Confirmed attendance counts towards your promotion points and appears in your MILPAC's operation history.

> **Tip:** The attendance post in Discord follows the same roster, so you can also sign up there when it's posted.

See also [[operations-lifecycle]] and [[reading-a-briefing]].`,
    },
    {
        _id: 'reading-a-briefing',
        title: 'Reading an operation briefing',
        category: 'operations',
        audience: 'member',
        order: 2,
        summary: 'Finding your orders, the map and the intel for a mission.',
        paths: ['/operations/*', '/operations/*/map'],
        keywords: ['briefing', 'orders', 'smeac', 'map', 'intel', 'mission', 'pdf', 'export', 'pages'],
        body: `Each operation page holds the briefing written by J2 (Mission Making).

- Longer briefings are split into **pages**. Use the page list (or the tab strip on a phone) to move between them.
- The **map** shows the area of operations, with the markers the mission maker placed. Open it full-screen from the operation.
- **Export PDF** saves a copy of the briefing to read offline.
- After the operation, an OCAP recording may be linked so you can replay it.

If a briefing is still being written, it won't be visible until J2 publishes it. See [[operations-lifecycle]].`,
    },
    {
        _id: 'operations-lifecycle',
        title: 'How an operation moves from draft to done',
        category: 'operations',
        audience: 'member',
        order: 3,
        summary: 'In Development, Upcoming, Active and Completed, and what each stage means for you.',
        paths: ['/operations'],
        keywords: ['status', 'upcoming', 'active', 'completed', 'in development', 'lifecycle', 'stage', 'rsvp open', 'closed'],
        body: `Operations move through four statuses:

1. **In Development**: J2 is still writing it. Only mission makers and staff can see it.
2. **Upcoming**: published. You can read the briefing, and RSVPs open on schedule.
3. **Active**: the operation is running now.
4. **Completed**: finished. Attendance confirmation happens here, then the operation becomes part of everyone's record.

Most of these steps happen on their own on a timer. Staff can move an operation along by hand when they need to.`,
    },
    {
        _id: 'interactive-maps',
        title: 'Using the interactive map',
        category: 'operations',
        audience: 'public',
        order: 4,
        summary: 'Exploring the terrains we play on.',
        paths: ['/maps'],
        keywords: ['map', 'maps', 'terrain', 'interactive', 'markers', 'zoom', 'grid'],
        body: `The [interactive map](/maps) lets you explore the terrains we play on.

- Drag to move and scroll (or pinch) to zoom.
- Choose a terrain from the list.
- Operation maps, with the mission's own markers, open from each operation page instead.`,
    },

    // ── Community ─────────────────────────────────────────────────────────────

    {
        _id: 'the-orbat',
        title: 'Reading the ORBAT',
        category: 'community',
        audience: 'public',
        order: 1,
        summary: 'How the unit is organised: platoons, sections, callsigns and positions.',
        paths: ['/orbat', '/about/callsigns'],
        keywords: ['orbat', 'structure', 'platoon', 'section', 'callsign', 'position', 'reservist', 'hq', 'command'],
        body: `The [ORBAT](/orbat) (order of battle) shows how ASOT is organised and who fills each position.

- **1 Platoon** plays on Saturdays and **2 Platoon** on Sundays. **3 Platoon** provides support assets on both days.
- Each platoon is split into sections with their own **callsigns**. See [callsigns](/about/callsigns).
- **Reservists** are members without a fixed slot. They're allocated to operations where they're needed.
- Headquarters and the gamemasters sit above and beside the platoons.

Click a member to open their MILPAC. Moving to another section is done through a move request with staff, not on this page.`,
    },
    {
        _id: 'your-milpac',
        title: 'Your MILPAC (service record)',
        category: 'community',
        audience: 'public',
        order: 2,
        summary: "What's on a MILPAC, and the parts you can change yourself.",
        paths: ['/milpacs', '/milpacs/*'],
        keywords: ['milpac', 'milpacs', 'record', 'rank', 'awards', 'medals', 'qualifications', 'uniform', 'certificate', 'promotion', 'bio', 'biography', 'cover', 'accent'],
        body: `[MILPACS](/milpacs) is the unit's personnel directory. Each member's MILPAC shows their rank, uniform and medal box, awards, qualifications, promotion history and the operations they've attended.

## What you can change on your own MILPAC
When you're signed in and viewing your own MILPAC you can:
- edit your **biography**,
- upload a **cover photo**,
- choose an **accent colour** for your page.

Everything else (rank, awards, qualifications) is kept by staff. If something is wrong, raise a [ticket](/tickets).

## Certificates
Signed-in members can click an award or a promotion to open its certificate full-screen and download it.

## Nominating someone for an award
On another member's MILPAC, use **Request Award** to nominate them. The nomination goes to staff for review. See the [awards page](/about/awards) for what can be earned.

## Promotion points
Your points come from confirmed operation attendance, training and some awards. Your MILPAC shows how close you are to the next rank.`,
    },
    {
        _id: 'kits',
        title: 'Sharing and copying kits',
        category: 'community',
        audience: 'public',
        order: 3,
        summary: 'Browse kits other members have shared, copy them into the ACE arsenal, and rate them.',
        paths: ['/kits', '/milpacs/*'],
        keywords: ['kit', 'kits', 'loadout', 'loadouts', 'arsenal', 'ace', 'copy', 'share', 'rate', 'stars', 'tags'],
        body: `The [kits shelf](/kits) collects loadouts members have shared with the unit.

## Finding a kit
Search by name or gear, filter by tags, and sort by newest, top rated, most copied or A to Z.

## Using a kit
Press **Copy** on a kit to copy its ACE arsenal export, then paste it into the ACE arsenal in game.

## Sharing your own kit
Kits live on your MILPAC's kit tab. Import your ACE arsenal export there, give it a name, description and tags, and mark it shared to put it on the shelf. Members can rate shared kits with stars.`,
    },
    {
        _id: 'gallery',
        title: 'The gallery and submitting screenshots',
        category: 'community',
        audience: 'public',
        order: 4,
        summary: 'Browsing operation screenshots and sending in your own.',
        paths: ['/gallery', '/gallery/*'],
        keywords: ['gallery', 'screenshot', 'photo', 'image', 'video', 'submit', 'upload', 'media', 'j5'],
        body: `The [gallery](/gallery) holds screenshots and videos from our operations, sorted by year, campaign and operation.

## Submitting your own
Members who've been given access see a **Submit** button in the gallery. Add your screenshots or a video link, say which operation they're from, and send them in. J5 (Media) reviews every submission before it's published, and you're notified either way.`,
    },
    {
        _id: 'support-and-wellbeing',
        title: 'Support and wellbeing',
        category: 'community',
        audience: 'public',
        order: 6,
        summary: 'Where to find wellbeing and crisis resources.',
        paths: ['/support'],
        keywords: ['support', 'wellbeing', 'mental health', 'crisis', 'help', 'talk'],
        body: `The [support page](/support) lists wellbeing and crisis resources for Australia and New Zealand.

If you'd rather talk to someone in the unit, any member of staff will listen and point you in the right direction. You can also raise a private [ticket](/tickets).`,
    },

    // ── Profile ───────────────────────────────────────────────────────────────

    {
        _id: 'notifications-and-preferences',
        title: 'Notifications and preferences',
        category: 'profile',
        audience: 'member',
        order: 1,
        summary: 'Choose what the site tells you about, on the site or by Discord DM.',
        paths: ['/preferences', '/me', '/dashboard/profile'],
        keywords: ['notification', 'notifications', 'bell', 'dm', 'discord', 'preferences', 'settings', 'cursor', 'mute'],
        body: `The bell at the top of the page shows your notifications. New ones arrive live while you have the site open.

## Choosing what you're told about
Open [Preferences](/preferences) to switch each kind of notification on or off, on the website and as a Discord DM. A few important system notices can't be switched off.

## Other settings
[Preferences](/preferences) also lets you turn the custom cursor off, and [your profile](/me) holds your timezone.`,
    },

    // ── Training ──────────────────────────────────────────────────────────────

    {
        _id: 'training-hub',
        title: 'Training: courses, RSVPs and qualifications',
        category: 'training',
        audience: 'member',
        order: 1,
        summary: 'Find training sessions, RSVP, request training, and earn qualifications.',
        paths: ['/dashboard/unit/training-hub', '/dashboard/j3', '/dashboard/unit/calendar'],
        keywords: ['training', 'course', 'qualification', 'rsvp', 'request', 'j3', 'instructor', 'pre-learning', 'selection', 'waitlist'],
        body: `Training is run by J3. Everything you need is in the [Training Hub](/dashboard/unit/training-hub).

## Joining a session
1. Open the Training Hub or the [calendar](/dashboard/unit/calendar) and pick a session.
2. RSVP. If the session is full you join the waitlist, and you're moved up automatically when a seat opens.
3. Some courses have **pre-learning**. It unlocks once you have a seat, so finish it before the session.

## Asking for training
Use **Request Training** in the Training Hub to ask for a course that isn't scheduled. J3 reviews requests and lets you know.

## Qualifications
When you pass a course, the trainer submits a ticket and J3 approves it. The qualification is then added to your MILPAC.`,
    },
    {
        _id: 'sops',
        title: 'Finding SOPs and training documents',
        category: 'training',
        audience: 'member',
        order: 2,
        summary: 'Where the unit\'s standard operating procedures and reference documents live.',
        paths: ['/dashboard/unit/sops', '/dashboard/unit/training-hub'],
        keywords: ['sop', 'sops', 'procedure', 'document', 'docs', 'reference', 'guide', 'manual'],
        body: `The unit's **standard operating procedures** are in [SOPs](/dashboard/unit/sops). They're written in the site's collaborative editor, so they're always the current version.

Training documents and guides for each course are in the [Training Hub](/dashboard/unit/training-hub).

Found a mistake in an SOP? Let the department that owns it know with a ticket. See [[raising-a-ticket]].`,
    },

    // ── Tickets ───────────────────────────────────────────────────────────────

    {
        _id: 'raising-a-ticket',
        title: 'Raising a ticket',
        category: 'tickets',
        audience: 'member',
        order: 1,
        summary: 'Requests, bug reports, mission ideas, feedback, complaints and award nominations.',
        paths: ['/tickets', '/tickets/*'],
        keywords: ['ticket', 'tickets', 'request', 'feedback', 'complaint', 'award', 'nomination', 'mod request', 'feature request', 'private', 'anonymous'],
        body: `[Tickets](/tickets) are how you ask the unit for something or tell it something.

## Kinds of ticket
- **Request**: a mod request or a feature request.
- **Bug**: something broken in ARMA, Discord, the website, the MILPAC, TeamSpeak or elsewhere.
- **Mission / Campaign / Objective**: ideas for J2.
- **Unit feedback** and **complaints**: these are private and only seen by the staff who handle them.
- **Award**: nominate someone for an award, or propose a new one.

## Raising one
1. Go to [Tickets](/tickets) and press **Start New Ticket**.
2. Pick the category and subtype, then fill in the details.
3. Submit. The ticket goes to the right department and you're notified as its status changes.

Your draft is kept while you write it. **Discard** deletes it for good.`,
    },
    {
        _id: 'reporting-a-website-bug',
        title: 'Reporting a website bug',
        category: 'tickets',
        audience: 'public',
        order: 2,
        summary: 'Two ways to tell us something on the site is broken.',
        paths: ['/tickets/new'],
        keywords: ['bug', 'broken', 'error', 'website', 'report', 'not working', 'issue', 'problem'],
        body: `Found something broken? There are two ways to report it.

- **From this help panel**: press **Report a bug** at the bottom of any guide, or on the **Suggest** tab. It goes to J7 with the page you were on attached. This is the quickest way for small things.
- **As a ticket**: [raise a Bug ticket](/tickets/new) with the **Website** subtype. Use this for anything that needs follow-up, and you can track its status.

Whichever you use, say what you did, what you expected, and what happened instead. A screenshot helps.`,
    },

    // ── Departments ───────────────────────────────────────────────────────────

    {
        _id: 'staff-dashboard',
        title: 'Getting around the staff dashboard',
        category: 'dashboard',
        audience: 'member',
        order: 1,
        summary: 'The sidebar, pinned tabs, the calendar and tasks.',
        paths: ['/dashboard'],
        keywords: ['dashboard', 'sidebar', 'pin', 'favourite', 'shortcut', 'tasks', 'calendar', 'staff', 'portal'],
        body: `The [dashboard](/dashboard) is the members' and staff portal.

## The sidebar
- **Departments** lists the J1 to J7 departments you belong to. Each department has its own tabs, and an **Admin** area for its leads.
- **Unit** holds the calendar, the Training Hub, SOPs, the mod database and tickets.
- **Personnel** (staff) holds the member lists.

## Pinning
Pin any page or department tab to the top of the sidebar with its pin icon, so the places you use most are one click away.

## Tasks
Staff are assigned [tasks](/dashboard/tasks) with due dates. You can ask for an extension, a reassignment or a deletion from the task itself. Overdue tasks can lock you out of other pages until they're dealt with.`,
    },
    {
        _id: 'departments-overview',
        title: 'What each department does',
        category: 'departments',
        audience: 'public',
        order: 2,
        summary: 'J1 Recruitment to J7 Community Development, in one line each.',
        paths: ['/dashboard/j1', '/dashboard/j2', '/dashboard/j3', '/dashboard/j4', '/dashboard/j5', '/dashboard/j6', '/dashboard/j7', '/about'],
        keywords: ['department', 'j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7', 'recruitment', 'mission making', 'training', 'administration', 'media', 'game master', 'zeus', 'development', 'staff'],
        body: `ASOT's staff are organised into seven departments:

- **J1 Recruitment**: applications, recruit sessions and new member onboarding.
- **J2 Mission Making**: writes and publishes operations, runs mission checks.
- **J3 Training**: courses, training events, qualifications and Selection.
- **J4 Administration**: the master sheet, discipline, discharges and site administration.
- **J5 Media**: the gallery, screenshots and the unit's media.
- **J6 Game Masters**: Zeus and live mission support.
- **J7 Community Development**: community projects, the development board, and this help wiki.

Interested in joining a department? Talk to its leads or raise a ticket.`,
    },
    {
        _id: 'j1-recruitment',
        title: 'J1: reviewing applications and recruiting',
        category: 'j1',
        audience: 'member',
        departments: ['j1'],
        order: 1,
        summary: 'Applications, the recruit wizard and the master sheet.',
        paths: ['/dashboard/j1'],
        keywords: ['j1', 'application', 'applications', 'recruit', 'recruiting', 'recruit session', 'mastersheet', 'returning member', 'quiz', 'bct'],
        body: `The [J1 dashboard](/dashboard/j1) has three main tabs:

- **Recruit Member** runs a live recruit session. The applicant follows along on their own screen while you take them through each step.
- **Applications** lists incoming applications. Open one to review it, then accept or deny it. Returning members are flagged so J4 can check their history.
- **Mastersheet** is J1's record of applicants and their progress.

The **Admin** area holds meetings, tickets and department settings for J1 leads.

More detail: [[j1-recruit-member]], [[j1-applications]], [[j1-induction-pack]] and [[j1-admin-tools]].`,
    },
    {
        _id: 'j2-mission-making',
        title: 'J2: writing and publishing operations',
        category: 'j2',
        audience: 'member',
        departments: ['j2'],
        order: 1,
        summary: 'Creating an operation, the editor, mission checks and publishing.',
        paths: ['/dashboard/j2', '/operations/*/edit'],
        keywords: ['j2', 'mission', 'mission making', 'operation', 'create', 'editor', 'publish', 'campaign', 'mission check', 'workspace', 'doctrine', 'orders'],
        body: `Operations are built from the [J2 dashboard](/dashboard/j2).

1. **Create** an operation from the Operations tab. It starts **In Development**, visible only to J2 and staff.
2. **Write the briefing** in the editor. It's collaborative, so other mission makers can edit with you live.
3. Build the **map** with markers for the area of operations.
4. **Request a mission check** before it goes live. J2 leads confirm and work through it.
5. **Publish** to move it to Upcoming. RSVPs then open on schedule.

The **Members Workspace** holds your own drafts and files. The **Mission Bible** and **Objective Suggestions** tabs collect the unit's lore and ideas.

More detail: [[j2-operations-board]], [[operation-editor-tabs]], [[j2-mission-checks]] and [[j2-workspace-and-lore]].`,
    },
    {
        _id: 'j7-help-wiki-review',
        title: 'J7: reviewing help wiki suggestions',
        category: 'j7',
        audience: 'member',
        departments: ['j7'],
        order: 2,
        summary: 'Approving edits, answering questions and keeping the wiki current.',
        paths: ['/dashboard/j7'],
        keywords: ['j7', 'wiki', 'help', 'review', 'approve', 'reject', 'suggestion', 'edit', 'article', 'revision', 'restore', 'faq', 'asked questions', 'assistant', 'pin'],
        body: `J7 owns this wiki. Everything readers send in, and everything the help assistant notices, lands in the **Help Wiki** tab of the [J7 dashboard](/dashboard/j7).

## The queue
- **Edit suggestions** show the current text beside the proposed text. **Approve** publishes the proposed version straight away. You can tidy it first with **Edit, then approve**.
- **New article ideas** become a new article when approved.
- **Bug reports** and **questions** don't change any article. Approve marks them handled, and the note you write goes back to the person who sent it.

If an article has changed since someone wrote their edit, the card warns you so you don't overwrite someone else's change.

## What the assistant raises
Suggestions from **Help assistant (AI)** come from questions people asked on the Ask tab:
- a question it **couldn't answer** from the guides: write a guide for it with **Write a guide for it**;
- a **possible fault**: the question sounded like something on the site isn't working. Check it, and pass it to whoever can fix it;
- a **FAQ draft**: three or more people asked the same thing, so it drafted a guide from its own answer. Check the answer before approving.

When you approve one, everyone who asked that question is told, with a link to the guide.

## Asked questions
**Asked questions** lists every question people have asked, rewordings folded together, most asked first. An answered question asked by two or more people shows in the FAQ, to readers who can see the guides its answer came from. For each one you can:
- **Pin** it so it always shows, or **Hide** it;
- **Edit** the wording or write your own answer;
- **Turn it into a guide**.

## Editing directly
The **Guides** view lets you edit, add, hide or restore any guide. Tick **Departments** to limit a guide to those departments' members. Every save keeps the previous copy under **History**, and you can restore any of them.

## Writing style
Write for someone who has never used the page. Lead with the answer, use numbered steps for anything done in order, and link the pages you mention with \`[text](/path)\`. Link other guides with \`[[slug]]\`.`,
    },

    // ── FAQ ───────────────────────────────────────────────────────────────────

    {
        _id: 'faq-playing',
        title: 'FAQ: when we play, mods and setup',
        category: 'faq',
        audience: 'public',
        order: 1,
        summary: 'Play days, first person, DLC, the modlist, and PvP.',
        paths: ['/about/faq', '/'],
        keywords: ['faq', 'when', 'play', 'saturday', 'sunday', 'mods', 'modlist', 'dlc', 'first person', 'pvp', 'cost', 'free', 'midweek'],
        body: `## When do you play?
Main operations run every weekend. **1 Platoon** plays Saturday, **2 Platoon** Sunday, and **3 Platoon** (support assets) supports both. There are optional mid-week missions and training sessions too.

## Do you force first person?
Yes.

## Do I need DLC?
No, though it's encouraged. Without it, some vehicles and equipment show a watermark.

## What mods do you use?
One main modlist, used for missions and the training server: [Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=2461898157). Any extra mods for a mission are posted in Discord.

## Do you do PvP?
Occasionally, in house, and it's optional. Our focus is PvE.

## Does it cost anything?
No. Donations help cover the running costs and are always appreciated. See [Donate](/donate).

More in the full [FAQ](/about/faq).`,
    },

    ...SITE_ARTICLES,
]
