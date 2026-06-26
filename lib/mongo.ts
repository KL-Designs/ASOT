import { MongoClient, Collection as MongoCollection, Document } from 'mongodb'

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set')
if (!process.env.MONGO_DB) throw new Error('MONGO_DB is not set')

// Cache the client on global so Next.js HMR doesn't leak a new connection on every hot reload
const globalWithMongo = global as typeof globalThis & { _mongoClient?: MongoClient }

if (!globalWithMongo._mongoClient) {
    globalWithMongo._mongoClient = new MongoClient(process.env.MONGO_URI)
    globalWithMongo._mongoClient.connect().catch(console.error)
}

const client = globalWithMongo._mongoClient
const db = client.db(process.env.MONGO_DB)

const DbInterface = {
    stats: () => db.stats().then(console.table).catch(console.error),

    users: db.collection('users') as MongoCollection<User>,
    roles: db.collection('roles') as MongoCollection<Role>,
    milpacs: db.collection('milpacs') as MongoCollection<Milpac>,
    optionals: db.collection('optionals') as MongoCollection<Optional>,
    operations: db.collection('operations') as MongoCollection<Operation>,
    operationActivity: db.collection<OperationActivityLog>('operation_activity'),
    minigameScores: db.collection('minigame_scores'),
    minigameLive: db.collection('minigame_live'),
    orbatPositions: db.collection('orbat_positions') as MongoCollection<OrbatPosition>,
    orbatSectionMeta: db.collection('orbat_section_meta') as MongoCollection<OrbatSectionMeta>,
    operationAttendance: db.collection('operation_attendance') as MongoCollection<OperationAttendance>,
    j1Applications: db.collection('j1_applications') as MongoCollection<J1Application>,
    tickets: db.collection('tickets') as MongoCollection<Ticket>,
    calendarEvents: db.collection('calendar_events') as MongoCollection<CalendarEvent>,
    siteSettings: db.collection('site_settings') as MongoCollection<{ _id: string } & Record<string, unknown>>,
    operationTemplates: db.collection('operation_templates') as MongoCollection<OperationTemplate>,
    operationCampaigns: db.collection('operation_campaigns') as MongoCollection<OperationCampaign>,
    campaignMissions: db.collection('campaign_missions') as MongoCollection<CampaignMission>,
    notifications: db.collection('notifications') as MongoCollection<Notification>,
    tasks: db.collection('tasks') as MongoCollection<Task>,
    calendarReminders: db.collection('calendar_reminders') as MongoCollection<CalendarReminder>,
    meetings: db.collection('meetings') as MongoCollection<Meeting>,
    actionLogs: db.collection('action_logs') as MongoCollection<ActionLog>,
    errorLogs: db.collection('error_logs') as MongoCollection<ErrorLog>,
    discordLogs: db.collection('discord_logs') as MongoCollection<DiscordLog>,
    driversLicense: db.collection('drivers_license') as MongoCollection<DriverLicenseEntry>,
    mapPresets: db.collection('map_presets'),
    retiredMembers: db.collection('retired_members') as MongoCollection<RetiredMember>,
    quizAttempts: db.collection('quiz_attempts') as MongoCollection<QuizAttempt>,
    communityTickets: db.collection('feedback') as MongoCollection<CommunityTicket>,
    communityTicketComments: db.collection('feedback_comments') as MongoCollection<CommunityTicketComment>,
    meetingNotifQueue: db.collection('meeting_notif_queue') as MongoCollection<MeetingNotifQueueRecord>,
    userPreferences: db.collection('user_preferences') as MongoCollection<UserPreferences>,
    notifPolicyConfig: db.collection('notif_policy_config') as MongoCollection<NotifPolicyConfig>,
    sops: db.collection('sops') as MongoCollection<SopDocument>,
    trainingDocs: db.collection('training_docs') as MongoCollection<TrainingDocItem>,
    teamspeakSnapshots: db.collection('teamspeak_snapshots') as MongoCollection<TsSnapshot>,
    recruitSessions: db.collection('recruit_sessions') as MongoCollection<RecruitSession>,
    tfarPlugins: db.collection('tfar_plugins'),
    inProgressRecruitments: db.collection('in_progress_recruitments') as MongoCollection<Document>,
    workspaceFiles: db.collection('workspace_files') as MongoCollection<Document>,
    workspaceDocs: db.collection('workspace_docs') as MongoCollection<Document>,
    workspaceVersions: db.collection('workspace_versions') as MongoCollection<Document>,
    leavingHistory: db.collection('leaving_history') as MongoCollection<LeavingHistoryRecord>,
    deniedApplicationsHQ: db.collection('denied_applications_hq') as MongoCollection<DeniedApplicationRecord>,
    disciplineRecords: db.collection('discipline_records') as MongoCollection<DisciplineRecord>,
    billetExtras: db.collection('billet_extras') as MongoCollection<BilletExtra>,
    memberEmails: db.collection('member_emails') as MongoCollection<MemberEmail>,
    mastersheetRecycleBin: db.collection('mastersheet_recycle_bin') as MongoCollection<MastersheetRecycleBinEntry>,
    dischargeSnapshots: db.collection('discharge_snapshots') as MongoCollection<DischargeSnapshot>,
    trainingTypes: db.collection('training_types') as MongoCollection<TrainingType>,
    trainingEvents: db.collection('training_events') as MongoCollection<TrainingEvent>,
    trainingAttendance: db.collection('training_attendance') as MongoCollection<TrainingAttendance>,
    trainingTypeDocs: db.collection('training_type_docs') as MongoCollection<TrainingDocument>,
    trainingRequests: db.collection('training_requests') as MongoCollection<TrainingRequest>,
    trainingTickets: db.collection('training_tickets') as MongoCollection<TrainingTicket>,
    trainingReminders: db.collection('training_reminders') as MongoCollection<TrainingReminderRecord>,
    trainingImportRecords: db.collection('training_import_records') as MongoCollection<Document>,
}

export default DbInterface
