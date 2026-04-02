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
    operationAttendance: client.db(process.env.MONGO_DB!).collection('operation_attendance') as MongoCollection<OperationAttendance>,

    // ranks: client.db(process.env.MONGO_DB!).collection('ranks') as MongoCollection<Rank>,
    // roles: client.db(process.env.MONGO_DB!).collection('roles') as MongoCollection<Role>,
    // sections: client.db(process.env.MONGO_DB!).collection('sections') as MongoCollection<Section>,
    // platoons: client.db(process.env.MONGO_DB!).collection('platoons') as MongoCollection<Platoon>,
    // certifications: client.db(process.env.MONGO_DB!).collection('certifications') as MongoCollection<Certification>,
    // awards: client.db(process.env.MONGO_DB!).collection('awards') as MongoCollection<Award>,
}

export default DbInterface