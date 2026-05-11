import { MongoClient, Collection as MongoCollection } from 'mongodb'


const client = new MongoClient(process.env.MONGO_URI!)
client.connect().catch(console.error)

client.on('connectionReady', () => { }) //console.info(`MongoDB Connected with "${process.env.MONGO_URI!}" using "${process.env.MONGO_DB!}"`)


const DbInterface = {
    stats: () => client.db(process.env.MONGO_DB!).stats().then(console.table).catch(console.error),

    users: client.db(process.env.MONGO_DB!).collection('users') as MongoCollection<User>,
    roles: client.db(process.env.MONGO_DB!).collection('roles') as MongoCollection<Role>,
    milpacs: client.db(process.env.MONGO_DB!).collection('milpacs') as MongoCollection<Milpac>,
    optionals: client.db(process.env.MONGO_DB!).collection('optionals') as MongoCollection<Optional>,
    operations: client.db(process.env.MONGO_DB!).collection('operations') as MongoCollection<Operation>,
    operationActivity: client.db(process.env.MONGO_DB!).collection<OperationActivityLog>('operation_activity'),
    minigameScores: client.db(process.env.MONGO_DB!).collection('minigame_scores'),
    minigameLive:   client.db(process.env.MONGO_DB!).collection('minigame_live'),
    orbatPositions: client.db(process.env.MONGO_DB!).collection('orbat_positions') as MongoCollection<OrbatPosition>,
    orbatSectionMeta: client.db(process.env.MONGO_DB!).collection('orbat_section_meta') as MongoCollection<OrbatSectionMeta>,
    operationAttendance: client.db(process.env.MONGO_DB!).collection('operation_attendance') as MongoCollection<OperationAttendance>,
    j1Applications: client.db(process.env.MONGO_DB!).collection('j1_applications') as MongoCollection<J1Application>,
    tickets: client.db(process.env.MONGO_DB!).collection('tickets') as MongoCollection<Ticket>,
    calendarEvents: client.db(process.env.MONGO_DB!).collection('calendar_events') as MongoCollection<CalendarEvent>,
    siteSettings: client.db(process.env.MONGO_DB!).collection('site_settings') as MongoCollection<{ _id: string } & Record<string, unknown>>,
    operationTemplates: client.db(process.env.MONGO_DB!).collection('operation_templates') as MongoCollection<OperationTemplate>,
    operationCampaigns: client.db(process.env.MONGO_DB!).collection('operation_campaigns') as MongoCollection<OperationCampaign>,
    notifications: client.db(process.env.MONGO_DB!).collection('notifications') as MongoCollection<Notification>,
    tasks: client.db(process.env.MONGO_DB!).collection('tasks') as MongoCollection<Task>,
    calendarReminders: client.db(process.env.MONGO_DB!).collection('calendar_reminders') as MongoCollection<CalendarReminder>,
    meetings: client.db(process.env.MONGO_DB!).collection('meetings') as MongoCollection<Meeting>,
    actionLogs: client.db(process.env.MONGO_DB!).collection('action_logs') as MongoCollection<ActionLog>,
    errorLogs: client.db(process.env.MONGO_DB!).collection('error_logs') as MongoCollection<ErrorLog>,
    discordLogs: client.db(process.env.MONGO_DB!).collection('discord_logs') as MongoCollection<DiscordLog>,
    driversLicense: client.db(process.env.MONGO_DB!).collection('drivers_license') as MongoCollection<DriverLicenseEntry>,
    mapPresets: client.db(process.env.MONGO_DB!).collection('map_presets'),
    retiredMembers: client.db(process.env.MONGO_DB!).collection('retired_members') as MongoCollection<RetiredMember>,
    quizAttempts: client.db(process.env.MONGO_DB!).collection('quiz_attempts') as MongoCollection<QuizAttempt>,
    communityTickets: client.db(process.env.MONGO_DB!).collection('feedback') as MongoCollection<CommunityTicket>,
    communityTicketComments: client.db(process.env.MONGO_DB!).collection('feedback_comments') as MongoCollection<CommunityTicketComment>,
    meetingNotifQueue: client.db(process.env.MONGO_DB!).collection('meeting_notif_queue') as MongoCollection<MeetingNotifQueueRecord>,
    userPreferences: client.db(process.env.MONGO_DB!).collection('user_preferences') as MongoCollection<UserPreferences>,
    notifPolicyConfig: client.db(process.env.MONGO_DB!).collection('notif_policy_config') as MongoCollection<NotifPolicyConfig>,
    sops: client.db(process.env.MONGO_DB!).collection('sops') as MongoCollection<SopDocument>,
    teamspeakSnapshots: client.db(process.env.MONGO_DB!).collection('teamspeak_snapshots') as MongoCollection<TsSnapshot>,

    // ranks: client.db(process.env.MONGO_DB!).collection('ranks') as MongoCollection<Rank>,
    // roles: client.db(process.env.MONGO_DB!).collection('roles') as MongoCollection<Role>,
    // sections: client.db(process.env.MONGO_DB!).collection('sections') as MongoCollection<Section>,
    // platoons: client.db(process.env.MONGO_DB!).collection('platoons') as MongoCollection<Platoon>,
    // certifications: client.db(process.env.MONGO_DB!).collection('certifications') as MongoCollection<Certification>,
    // awards: client.db(process.env.MONGO_DB!).collection('awards') as MongoCollection<Award>,
}

export default DbInterface