import config from 'config'
import { MongoClient, Collection as MongoCollection } from 'mongodb'


const client = new MongoClient(config.mongo.uri)
// Log once, when the initial connection resolves — not via the 'connectionReady' event,
// which fires per pooled connection and spams the console once the app starts making
// concurrent queries (e.g. processMembers()'s per-member lookups opening several
// connections in quick succession).
client.connect()
    .then(() => console.info(`MongoDB Connected with "${config.mongo.uri}" using "${config.mongo.db}"`))
    .catch(console.error)


const DbInterface = {
    test: () => client.db(config.mongo.db).stats(),
    stats: () => client.db(config.mongo.db).stats().then(console.table).catch(console.error),

    data: client.db(config.mongo.db).collection('data') as MongoCollection<StatusData | SyncStateData>,
    users: client.db(config.mongo.db).collection('users') as MongoCollection<User>,
    roles: client.db(config.mongo.db).collection('roles') as MongoCollection<Role>,
    optionals: client.db(config.mongo.db).collection('optionals') as MongoCollection<Optional>,
    reminders: client.db(config.mongo.db).collection('reminders') as MongoCollection<Reminder>,
    // tickets: client.db(config.mongo.db).collection('tickets') as MongoCollection<Ticket>,
}

export default DbInterface