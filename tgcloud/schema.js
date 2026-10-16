import { table, integer, text, real, json, index } from 'sdk/db';

// Your database tables go here as named exports. Deploying this file registers the
// schema; applying the changes (a migration) updates the database.

// One row per chat that receives the report and the alerts.
export const subscribers = table('subscribers', {
  chatId: integer('chat_id').primaryKey(), // Telegram chat id (also the user id in a private chat)
  name: text('name'),                       // first name, used in the greeting
  city: text('city'),                       // display label — "New York", or "Your location" for a pin
  lat: real('lat'),
  lon: real('lon'),
  tzOffsetMin: integer('tz_offset_min'),    // minutes east of UTC, refreshed on every weather fetch
  depTime: text('dep_time'),                // "07:45" — commute departure, null = off
  alertMin: real('alert_min'),              // custom temperature alert, null = off
  alertMax: real('alert_max'),
  trip: text('trip'),                       // active travel-budget trip label, null = none
  seen: json('seen'),                       // { "<event>:<stamp>": unix ms } — what already went out
});

// Birthdays, anniversaries and one-off countdowns.
export const events = table('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  title: text('title').notNull(),           // "Mom's birthday"
  kind: text('kind').notNull(),             // 'birthday' | 'anniversary' | 'event'
  date: text('date').notNull(),             // recurring "MM-DD", one-off "YYYY-MM-DD"
  year: integer('year'),                    // set when the year matters (age / how many years)
}, (t) => ({
  chatIdx: index('idx_events_chat').on(t.chatId), // the heartbeat lists per chat, every run
}));

// Travel-budget expenses, one row per spend.
export const expenses = table('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  trip: text('trip').notNull(),             // trip label ("Tokyo")
  amount: real('amount').notNull(),
  category: text('category'),               // first word of the note
  note: text('note'),
}, (t) => ({
  chatIdx: index('idx_expenses_chat').on(t.chatId),
}));

// Memory Lane: a photo/video the user sent, replayed on its anniversary.
export const memories = table('memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  fileId: text('file_id').notNull(),        // Telegram file_id — reusable by this bot
  kind: text('kind').notNull(),             // 'photo' | 'video'
  caption: text('caption'),
  dayKey: text('day_key').notNull(),        // "MM-DD"
  year: integer('year').notNull(),
}, (t) => ({
  chatIdx: index('idx_memories_chat').on(t.chatId),
}));

// Relationship CRM: last contact with friends.
export const contacts = table('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  name: text('name').notNull(),
  intervalDays: integer('interval_days').notNull(), // wanted cadence
  lastContact: integer('last_contact', { mode: 'timestamp' }).notNull(), // Date
}, (t) => ({
  chatIdx: index('idx_contacts_chat').on(t.chatId),
}));

// One active card game per chat.
export const games = table('games', {
  chatId: integer('chat_id').primaryKey(),
  owner: integer('owner').notNull(),        // only this user may play
  state: json('state').notNull(),
});

// The (single) group that accepts anonymous confessions via DM.
export const confessions = table('confessions', {
  groupId: integer('group_id').primaryKey(),
});
