// endpoints/pulse.js — the "heartbeat" runner the scheduler (if any) calls.
//
// Telegram Serverless has no built-in timer. Without a scheduler the bot's own
// handlers run the heartbeat whenever the user does something; this module is
// for the day you want alerts with no user activity: run it from any scheduler
// (Windows Task Scheduler, GitHub Actions, a cron host, …) with `npm run pulse`
// — i.e. `npx tgcloud run endpoints/pulse`. It runs the heartbeat for every
// subscriber and returns what each one received.
//
// Subscribers are processed a few at a time (not all at once — stay well under
// Telegram's rate limits; not one by one — a slow fetch for one chat must not
// hold up the rest).
import { listSubscribers } from '../lib/store.js';
import { heartbeat } from '../lib/heartbeat.js';

const CONCURRENCY = 4;

export default async function (input, ctx) {
  const subs = await listSubscribers();

  const results = [];
  const runnable = [];
  for (const sub of subs) {
    if (sub.lat == null || sub.lon == null) {
      results.push({ chat: sub.chatId, skipped: 'no location set' });
      continue;
    }
    runnable.push(sub);
  }

  let next = 0;
  const worker = async () => {
    while (next < runnable.length) {
      const sub = runnable[next++]; // single-threaded: no race between the check and the bump
      try {
        const r = await heartbeat(sub);
        results.push({ chat: sub.chatId, city: sub.city, sent: r.sent, throttled: r.throttled || undefined });
      } catch (err) {
        console.error(`pulse failed for chat ${sub.chatId}`, err);
        results.push({ chat: sub.chatId, error: String((err && err.message) || err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, runnable.length) }, worker));

  return { checked: results.length, results };
}
