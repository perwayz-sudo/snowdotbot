// All database access for the bot's tables — subscriber rows plus the
// feature tables (events, expenses, memories, contacts, games, confessions).
import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { subscribers, events, expenses, memories, contacts, games, confessions } from '../schema.js';

// --- subscribers ------------------------------------------------------------

export async function getSubscriber(chatId) {
  return db.select().from(subscribers).where(eq(subscribers.chatId, chatId)).get();
}

// Insert the chat or update the given fields; returns the fresh row.
export async function upsertSubscriber(chatId, fields) {
  const rows = await db
    .insert(subscribers)
    .values({ chatId, ...fields })
    .onConflictDoUpdate({ target: subscribers.chatId, set: fields })
    .returning()
    .run();
  return rows[0];
}

export async function listSubscribers() {
  return db.select().from(subscribers).all();
}

export async function deleteSubscriber(chatId) {
  await db.delete(subscribers).where(eq(subscribers.chatId, chatId)).run();
}

// What the heartbeat learned this run: the fresh UTC offset and the new seen map.
export async function saveHeartbeat(chatId, { tzOffsetMin, seen }) {
  await db
    .update(subscribers)
    .set({ tzOffsetMin, seen })
    .where(eq(subscribers.chatId, chatId))
    .run();
}

// Set (or clear, with null) the budget trip the chat is currently on.
export async function setTrip(chatId, trip) {
  await db.update(subscribers).set({ trip }).where(eq(subscribers.chatId, chatId)).run();
}

// --- events (birthdays / anniversaries / countdowns) ------------------------

export async function insertEvent(chatId, { title, kind, date, year }) {
  const rows = await db
    .insert(events)
    .values({ chatId, title, kind, date, year: year ?? null })
    .returning()
    .run();
  return rows[0];
}

export async function listEvents(chatId) {
  return db.select().from(events).where(eq(events.chatId, chatId)).all();
}

export async function getEvent(chatId, id) {
  return db.select().from(events).where(and(eq(events.chatId, chatId), eq(events.id, id))).get();
}

export async function deleteEvent(chatId, id) {
  const row = await getEvent(chatId, id);
  if (!row) return false;
  await db.delete(events).where(eq(events.id, id)).run();
  return true;
}

// --- expenses (travel budget) ----------------------------------------------

export async function insertExpense(chatId, { trip, amount, category, note }) {
  const rows = await db
    .insert(expenses)
    .values({ chatId, trip, amount, category: category ?? null, note: note ?? null })
    .returning()
    .run();
  return rows[0];
}

export async function listExpenses(chatId) {
  return db.select().from(expenses).where(eq(expenses.chatId, chatId)).all();
}

// --- memories (Memory Lane) -------------------------------------------------

export async function insertMemory(chatId, { fileId, kind, caption, dayKey, year }) {
  const rows = await db
    .insert(memories)
    .values({ chatId, fileId, kind, caption: caption ?? null, dayKey, year })
    .returning()
    .run();
  return rows[0];
}

export async function listMemories(chatId) {
  return db.select().from(memories).where(eq(memories.chatId, chatId)).all();
}

export async function deleteMemory(chatId, id) {
  const row = await db.select().from(memories).where(and(eq(memories.chatId, chatId), eq(memories.id, id))).get();
  if (!row) return false;
  await db.delete(memories).where(eq(memories.id, id)).run();
  return true;
}

// --- contacts (relationship CRM) -------------------------------------------

export async function insertContact(chatId, { name, intervalDays, lastContact }) {
  const rows = await db
    .insert(contacts)
    .values({ chatId, name, intervalDays, lastContact })
    .returning()
    .run();
  return rows[0];
}

export async function listContacts(chatId) {
  return db.select().from(contacts).where(eq(contacts.chatId, chatId)).all();
}

export async function findContact(chatId, name) {
  const wanted = String(name || '').trim().toLowerCase();
  const rows = await db.select().from(contacts).where(eq(contacts.chatId, chatId)).all();
  return rows.find((r) => r.name.toLowerCase() === wanted) || null;
}

export async function updateContact(id, fields) {
  await db.update(contacts).set(fields).where(eq(contacts.id, id)).run();
}

export async function deleteContact(id) {
  await db.delete(contacts).where(eq(contacts.id, id)).run();
}

// --- games (blackjack) ------------------------------------------------------

export async function getGame(chatId) {
  return db.select().from(games).where(eq(games.chatId, chatId)).get();
}

export async function saveGame(chatId, owner, state) {
  await db
    .insert(games)
    .values({ chatId, owner, state })
    .onConflictDoUpdate({ target: games.chatId, set: { owner, state } })
    .run();
}

export async function deleteGame(chatId) {
  await db.delete(games).where(eq(games.chatId, chatId)).run();
}

// --- confessions ------------------------------------------------------------

// The single group that accepts confessions (first one wins).
export async function getConfessionGroup() {
  return db.select().from(confessions).get();
}

export async function setConfessionGroup(groupId) {
  await db.insert(confessions).values({ groupId }).onConflictDoNothing({ target: confessions.groupId }).run();
}

export async function clearConfessionGroup(groupId) {
  await db.delete(confessions).where(eq(confessions.groupId, groupId)).run();
}
