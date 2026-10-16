// handlers/message.js — runs on each `message` update.
//
// Weather: /start /help /city /report /rain /air /uv /workout /sky /commute
// /limits /weather /stop — plus a shared location to set the city.
// Fun: /roll /coin /flip /slots /joke /riddle /blackjack /watch /poll.
// Reminders: /event /events /contact /contacted /crm /memory (photos welcome).
// Social: /confess (group admins enable it; everyone DMs confessions).
// Money: /trip /spent /budget. Travel: /pack.
// After handling, the heartbeat sends whatever is due (report, alerts, birthday
// reminders, Memory Lane, overdue friends). Keep it last.
import { api } from 'sdk';
import {
  getSubscriber,
  upsertSubscriber,
  deleteSubscriber,
  insertEvent,
  listEvents,
  deleteEvent,
  insertExpense,
  listExpenses,
  setTrip,
  insertMemory,
  listMemories,
  deleteMemory,
  insertContact,
  listContacts,
  findContact,
  updateContact,
  deleteContact,
  getGame,
  saveGame,
  deleteGame,
  getConfessionGroup,
  setConfessionGroup,
  clearConfessionGroup,
} from '../lib/store.js';
import {
  geocodeCity,
  lookupLabel,
  fetchWeather,
  fetchAir,
  fetchTravelForecast,
  fetchArchive,
} from '../lib/weather.js';
import { heartbeat } from '../lib/heartbeat.js';
import {
  aqiInfo,
  commuteHourly,
  rainWindow,
  stargazingTonight,
  uvInfo,
  uvNow,
  workoutWindow,
} from '../lib/insights.js';
import { localNow, localDateOf, localIsoMinute, eventKey, SEND_HOUR } from '../lib/schedule.js';
import { parseTravelQuery, daysAhead, previousYear } from '../lib/travel.js';
import { parseEventArgs, nextOccurrence, dueContacts, prettyOccurrence } from '../lib/reminders.js';
import { JOKES, WATCH_GENRES, WATCH_LABELS, randomFrom, riddleOfDay, slotsSpin } from '../lib/content.js';
import { newGame, renderGame } from '../lib/cards.js';
import { newPokerGame, renderPoker } from '../lib/poker.js';
import {
  BOT_COMMANDS,
  BOT_COMMANDS_GROUP,
  funKeyboard,
  hideKeyboard,
  mainKeyboard,
  menuAction,
} from '../lib/menu.js';
import { suggestGifts } from '../lib/gifts.js';
import { buildChecklist, formatChecklist } from '../lib/packing.js';
import {
  buildAirReply,
  buildBudgetReply,
  buildCommuteLine,
  buildEventsList,
  buildFunPrompt,
  buildGiftIdeas,
  buildMenuPrompt,
  buildPollHint,
  buildRainReply,
  buildRiddleOfDay,
  buildSetupHint,
  buildSkyReply,
  buildSlotsReply,
  buildTravelForecast,
  buildTravelHint,
  buildTravelTypical,
  buildUVLine,
  buildWatchReply,
  buildWorkoutReply,
} from '../lib/format.js';

const TRAVEL_USAGE = '🧳 Usage: /weather <city> <date> — e.g. /weather Tokyo Jul 10 or /weather Tokyo 2026-11-02';
const PACK_USAGE = '🧳 Usage: /pack <city> <date> — e.g. /pack Tokyo Jul 10';

function helpText(name) {
  return (
    `👋 Hi${name ? ' ' + name : ''}! I'm your personal bot — weather plus a small toolkit.\n\n` +
    `☰ No need to type commands — tap the buttons at the bottom. /menu brings the bar back, /menu hide removes it.\n\n` +
    `☀️ Report: from ${SEND_HOUR}:00 (your city's time) I send the morning report the next time you message — once a day. ` +
    `Rain, temperature, stargazing, Friday weekend and Sunday recap alerts arrive the same way.\n` +
    `📌 Set your city: tap 📍 My location, or send /city Berlin.\n\n` +
    `Weather & advice:\n` +
    `/report · /rain · /air · /uv · /workout · /sky\n\n` +
    `Fun:\n` +
    `/roll 2d6 · /coin · /slots · /joke · /riddle · /blackjack · /poker · /watch\n` +
    `/poll Question | option A | option B\n\n` +
    `Reminders:\n` +
    `/event add birthday Mom Jun 16 · /events\n` +
    `/contact add Sam 30 · /contacted Sam · /crm\n` +
    `/memory — send me a photo and I'll replay it on this day next year\n\n` +
    `Travel & money:\n` +
    `/weather Tokyo Jul 10 · /pack Tokyo Jul 10\n` +
    `/trip Tokyo · /spent 25 lunch · /budget\n\n` +
    `Setup: /commute 07:45 · /limits -5 30 · /menu · /stop\n` +
    `Groups: /confess on — anonymous confessions via DM`
  );
}

// "/city@MyBot Berlin" → { cmd: 'city', args: 'Berlin' }
function parseCommand(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const space = trimmed.search(/\s/);
  const head = (space === -1 ? trimmed : trimmed.slice(0, space)).slice(1).split('@')[0].toLowerCase();
  const args = space === -1 ? '' : trimmed.slice(space + 1).trim();
  return { cmd: head, args };
}

// "2d6" → { n: 2, m: 6 }; plain "20" → one d20.
function parseDice(args) {
  const s = String(args || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { n: 1, m: 6 };
  const m = /^(\d{1,2})?d(\d{1,4})$/.exec(s);
  if (m) {
    const n = m[1] ? Number(m[1]) : 1;
    const sides = Number(m[2]);
    if (n < 1 || n > 10 || sides < 2 || sides > 1000) return { error: true };
    return { n, m: sides };
  }
  if (/^\d{1,4}$/.test(s)) {
    const sides = Number(s);
    if (sides >= 2 && sides <= 1000) return { n: 1, m: sides };
  }
  return { error: true };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function daysSince(dateish) {
  return Math.floor((Date.now() - new Date(dateish).getTime()) / 86400000);
}

export default async function (message, ctx) {
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const fromId = message.from?.id ?? null;
  const name = message.from?.first_name || null;
  const reply = (text) => api.sendMessage({ chat_id: chatId, text });
  const show = (text, extra) => api.sendMessage({ chat_id: chatId, text, ...extra });
  const wx = (sub) => fetchWeather({ lat: sub.lat, lon: sub.lon, label: sub.city, quick: true });
  // The fresh city-local "now" to the minute, from a weather payload.
  const localNowOf = (w) => localIsoMinute(localNow(Date.now(), w.tzOffsetMin));
  let heartbeatDone = false;

  let sub = await getSubscriber(chatId);
  // City-local "today" from the cached offset (UTC when we've never fetched).
  const localToday = () => localDateOf(localNow(Date.now(), sub?.tzOffsetMin ?? 0));

  // A row for commands that need a city; null (with a nudge) when there is none.
  // Uses the row already loaded above — nothing in one message run invalidates
  // it (every mutation below re-assigns `sub` with the fresh row).
  const requireSub = async () => {
    if (!sub || sub.lat == null || sub.lon == null) {
      await reply('📌 First tell me your city — tap 📍 My location in the menu, or send /city <name>.');
      return null;
    }
    return sub;
  };

  // Register the ☰ command list with Telegram (idempotent; runs on /start and
  // /menu at most once each).
  let commandsSynced = false;
  const ensureCommands = async () => {
    if (commandsSynced) return;
    commandsSynced = true;
    try {
      await api.setMyCommands({ commands: BOT_COMMANDS });
      await api.setMyCommands({ commands: BOT_COMMANDS_GROUP, scope: { type: 'all_group_chats' } });
    } catch (err) {
      commandsSynced = false;
      console.warn('setMyCommands failed', err && err.message);
    }
  };
  // Remember that an on-demand answer already covered a heartbeat event — and
  // keep the local row in sync so the trailing heartbeat sees it (no re-read).
  const markSeen = async (key) => {
    const seen = { ...(sub?.seen || {}), [key]: Date.now() };
    if (sub) sub.seen = seen;
    await upsertSubscriber(chatId, { seen });
  };
  const eventList = async () => {
    const rows = await listEvents(chatId);
    return rows.map((r) => ({ id: r.id, event: r, occurrence: nextOccurrence(r, localToday()) }));
  };

  // A shared location sets (or moves) the city.
  if (message.location) {
    const { latitude: lat, longitude: lon } = message.location;
    let label = null;
    try {
      label = await lookupLabel(lat, lon);
    } catch (err) {
      console.warn('reverse geocoding failed', err && err.message);
    }
    sub = await upsertSubscriber(chatId, { name, city: label || 'Your location', lat, lon });
    await reply(`📍 Location saved: ${sub.city} (${lat.toFixed(3)}, ${lon.toFixed(3)}). Here's your report:`);
    try {
      await heartbeat(sub, { forceReport: true });
      heartbeatDone = true;
    } catch (err) {
      console.error('report after location share failed', err);
      await reply("Couldn't fetch the weather right now — try /report again in a minute.");
    }
    return;
  }

  // A photo (or video) becomes a Memory Lane entry — replayed next year.
  if (message.photo || message.video) {
    const fileId = message.photo ? message.photo[message.photo.length - 1].file_id : message.video.file_id;
    const kind = message.photo ? 'photo' : 'video';
    const caption = (message.caption || '').trim() || null;
    const today = localToday();
    try {
      const row = await insertMemory(chatId, {
        fileId,
        kind,
        caption,
        dayKey: today.slice(5),
        year: Number(today.slice(0, 4)),
      });
      await reply(`📸 Saved (#${row.id}) — I'll bring this back on ${prettyOccurrence(today)} next year.`);
    } catch (err) {
      console.error('memory save failed', err);
      await reply("Couldn't save that — try again in a minute.");
    }
  }

  const parsedCmd = parseCommand(message.text);
  let command = parsedCmd;
  let menuHandled = false;

  // Menu-bar taps arrive as plain text — translate them back into commands.
  if (!parsedCmd && message.text && !message.photo && !message.video) {
    const act = menuAction(message.text);
    if (act) {
      if (act.cmd) {
        command = { cmd: act.cmd, args: '' };
      } else if (act.fun) {
        await show(buildFunPrompt(), { reply_markup: funKeyboard() });
        menuHandled = true;
      } else if (act.main) {
        await show(buildMenuPrompt(), { reply_markup: mainKeyboard() });
        menuHandled = true;
      } else if (act.hide) {
        await show('🙈 Menu hidden — send /menu to bring it back.', { reply_markup: hideKeyboard() });
        menuHandled = true;
      } else if (act.info === 'travel') {
        await reply(buildTravelHint());
        menuHandled = true;
      } else if (act.info === 'setup') {
        await reply(buildSetupHint());
        menuHandled = true;
      } else if (act.info === 'poll') {
        await reply(buildPollHint());
        menuHandled = true;
      }
    }
  }

  if (command) {
    switch (command.cmd) {
      case 'start': {
        sub = await upsertSubscriber(chatId, { name });
        await ensureCommands();
        if (sub.lat != null && sub.lon != null) {
          await show(
            `Welcome back${name ? ', ' + name : ''}! ☀️ Your city is ${sub.city}. ` +
            `Tap a button below, or send me anything after ${SEND_HOUR}:00 and today's report lands right away — /report any time.`,
            { reply_markup: mainKeyboard() },
          );
        } else {
          await show(helpText(name), { reply_markup: mainKeyboard() });
        }
        break;
      }

      case 'help':
        await show(helpText(name), { reply_markup: mainKeyboard() });
        break;

      case 'menu': {
        if (command.args.trim().toLowerCase() === 'hide') {
          await show('🙈 Menu hidden — send /menu to bring it back.', { reply_markup: hideKeyboard() });
          break;
        }
        await ensureCommands();
        await show(buildMenuPrompt(), { reply_markup: mainKeyboard() });
        break;
      }

      case 'city': {
        if (!command.args) {
          await reply('Usage: /city <name> — e.g. /city Berlin, /city New York, /city Paris');
          break;
        }
        let place = null;
        try {
          place = await geocodeCity(command.args);
        } catch (err) {
          console.error('geocoding failed', err);
          await reply("Couldn't look that up right now — try again in a minute.");
          break;
        }
        if (!place) {
          await reply(`Couldn't find a city named "${command.args}". Check the spelling, or share your location instead.`);
          break;
        }
        sub = await upsertSubscriber(chatId, { name, city: place.label, lat: place.lat, lon: place.lon });
        await reply(`📍 City set to ${place.label}. Here's your report:`);
        try {
          await heartbeat(sub, { forceReport: true });
          heartbeatDone = true;
        } catch (err) {
          console.error('report after /city failed', err);
          await reply("Couldn't fetch the weather right now — try /report again in a minute.");
        }
        break;
      }

      case 'report': {
        const s = await requireSub();
        if (s) {
          try {
            await heartbeat(s, { forceReport: true });
            heartbeatDone = true;
          } catch (err) {
            console.error('report failed', err);
            await reply("Couldn't fetch the weather right now — try again in a minute.");
          }
        }
        break;
      }

      case 'rain': {
        const s = await requireSub();
        if (s) {
          try {
            const w = await wx(s);
            const rain = rainWindow(w.hourly, localNowOf(w), { hours: 12 });
            await reply(buildRainReply(w.label, rain));
            if (rain) await markSeen(eventKey('rain', rain.startIso));
          } catch (err) {
            console.error('rain check failed', err);
            await reply("Couldn't check the rain right now — try again in a minute.");
          }
        }
        break;
      }

      case 'air': {
        const s = await requireSub();
        if (s) {
          try {
            const [w, air] = await Promise.all([wx(s), fetchAir(s.lat, s.lon)]);
            await reply(buildAirReply(
              w.label,
              { ...aqiInfo(air.usAqi), pm25: air.pm25, pm10: air.pm10 },
              uvNow(w.hourly, localNowOf(w)),
              uvInfo(w.today.uv),
            ));
          } catch (err) {
            console.error('air quality check failed', err);
            await reply("Couldn't fetch the air quality right now — try again in a minute.");
          }
        }
        break;
      }

      case 'uv': {
        const s = await requireSub();
        if (s) {
          try {
            const w = await wx(s);
            await reply(buildUVLine(uvNow(w.hourly, localNowOf(w)), uvInfo(w.today.uv)));
          } catch (err) {
            console.error('uv check failed', err);
            await reply("Couldn't fetch the UV index right now — try again in a minute.");
          }
        }
        break;
      }

      case 'workout': {
        const s = await requireSub();
        if (s) {
          try {
            const w = await wx(s);
            await reply(buildWorkoutReply(workoutWindow(w.hourly, localNowOf(w))));
          } catch (err) {
            console.error('workout check failed', err);
            await reply("Couldn't check the forecast right now — try again in a minute.");
          }
        }
        break;
      }

      case 'sky': {
        const s = await requireSub();
        if (s) {
          try {
            const w = await wx(s);
            const star = stargazingTonight(w.hourly, w.todayIso);
            await reply(buildSkyReply(w.label, star));
            await markSeen(eventKey('star', w.todayIso));
          } catch (err) {
            console.error('sky check failed', err);
            await reply("Couldn't check the sky right now — try again in a minute.");
          }
        }
        break;
      }

      case 'commute': {
        const s = await requireSub();
        if (!s) break;
        const arg = command.args.toLowerCase();
        if (arg === 'off') {
          sub = await upsertSubscriber(chatId, { depTime: null });
          await reply('🚴 Commute report off. Set it again any time with /commute 07:45.');
          break;
        }
        let dep = s.depTime;
        if (arg) {
          const m = /^(2[0-3]|[01]?\d):([0-5]\d)$/.exec(command.args);
          if (!m) {
            await reply('Usage: /commute 07:45 — or /commute off to disable.');
            break;
          }
          dep = `${m[1].padStart(2, '0')}:${m[2]}`;
          sub = await upsertSubscriber(chatId, { depTime: dep });
        }
        if (!dep) {
          await reply('🚴 Set your departure first — e.g. /commute 07:45.');
          break;
        }
        try {
          const w = await wx(s);
          const line = buildCommuteLine(commuteHourly(w, dep, localNowOf(w)), dep);
          await reply(line || `🚴 No forecast data around ${dep} yet.`);
        } catch (err) {
          console.error('commute check failed', err);
          await reply("Couldn't fetch the forecast right now — try again in a minute.");
        }
        break;
      }

      case 'limits': {
        const s = await requireSub();
        if (!s) break;
        const toks = command.args.split(/[\s,]+/).filter(Boolean);
        if (toks.length === 1 && toks[0].toLowerCase() === 'off') {
          sub = await upsertSubscriber(chatId, { alertMin: null, alertMax: null });
          await reply('🌡 Temperature alerts off.');
          break;
        }
        if (toks.length !== 2) {
          await reply('Usage: /limits <min> <max> — e.g. /limits -5 30 (or /limits off)');
          break;
        }
        const min = Number(toks[0]);
        const max = Number(toks[1]);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
          await reply('Those limits don\'t look right — e.g. /limits -5 30 (min lower than max).');
          break;
        }
        sub = await upsertSubscriber(chatId, { alertMin: min, alertMax: max });
        await reply(`🌡 Temperature alerts on: 🥶 below ${min}°C · 🥵 above ${max}°C.`);
        break;
      }

      case 'weather': {
        const parsed = parseTravelQuery(command.args, Date.now());
        if (!parsed) {
          await reply(TRAVEL_USAGE);
          break;
        }
        if (parsed.error) {
          await reply('🧳 ' + parsed.error);
          break;
        }
        if (!parsed.city) {
          await reply(TRAVEL_USAGE);
          break;
        }
        if (!parsed.dateIso) {
          await reply(`📅 Which date for ${parsed.city}? e.g. /weather ${parsed.city} Jul 10`);
          break;
        }
        let place = null;
        try {
          place = await geocodeCity(parsed.city);
        } catch (err) {
          console.error('travel geocoding failed', err);
          await reply("Couldn't look that city up right now — try again in a minute.");
          break;
        }
        if (!place) {
          await reply(`Couldn't find a city named "${parsed.city}".`);
          break;
        }
        const utcToday = new Date().toISOString().slice(0, 10);
        const ahead = daysAhead(utcToday, parsed.dateIso);
        try {
          if (ahead >= 0 && ahead <= 16) {
            const t = await fetchTravelForecast(place.lat, place.lon, parsed.dateIso, { label: place.label });
            await reply(buildTravelForecast(t));
          } else if (ahead < 0) {
            const t = await fetchArchive(place.lat, place.lon, parsed.dateIso, { label: place.label });
            await reply(t
              ? buildTravelTypical(t)
              : `📅 No archive data for ${parsed.dateIso} yet — recent dates take a few days to appear.`);
          } else {
            const t = await fetchArchive(place.lat, place.lon, previousYear(parsed.dateIso), { label: place.label });
            await reply(t
              ? buildTravelTypical(t, { beyond: true })
              : '📅 No data for that date.');
          }
        } catch (err) {
          console.error('travel forecast failed', err);
          await reply("Couldn't fetch that forecast right now — try again in a minute.");
        }
        break;
      }

      case 'pack': {
        const parsed = parseTravelQuery(command.args, Date.now());
        if (!parsed || parsed.error || !parsed.city) {
          await reply(parsed?.error ? '🧳 ' + parsed.error : PACK_USAGE);
          break;
        }
        if (!parsed.dateIso) {
          await reply(`📅 Which date for ${parsed.city}? e.g. /pack ${parsed.city} Jul 10`);
          break;
        }
        let place = null;
        try {
          place = await geocodeCity(parsed.city);
        } catch (err) {
          console.error('pack geocoding failed', err);
          await reply("Couldn't look that city up right now — try again in a minute.");
          break;
        }
        if (!place) {
          await reply(`Couldn't find a city named "${parsed.city}".`);
          break;
        }
        const utcToday = new Date().toISOString().slice(0, 10);
        const ahead = daysAhead(utcToday, parsed.dateIso);
        try {
          if (ahead >= 0 && ahead <= 16) {
            const t = await fetchTravelForecast(place.lat, place.lon, parsed.dateIso, { label: place.label });
            const sections = buildChecklist({
              max: t.day.max,
              min: t.day.min,
              pop: t.day.pop ?? 0,
              precipMm: t.day.precipMm ?? 0,
              windMs: t.day.windMs ?? 0,
              uv: t.day.uv ?? 0,
            });
            await reply(formatChecklist(place.label, parsed.dateIso, sections));
          } else {
            const archiveIso = ahead < 0 ? parsed.dateIso : previousYear(parsed.dateIso);
            const t = await fetchArchive(place.lat, place.lon, archiveIso, { label: place.label });
            if (!t) {
              await reply('📅 No data for that date.');
              break;
            }
            const sections = buildChecklist({
              max: t.max,
              min: t.min,
              precipMm: t.precipMm ?? 0,
            });
            await reply(formatChecklist(place.label, parsed.dateIso, sections, { beyond: ahead > 16 }));
          }
        } catch (err) {
          console.error('packing checklist failed', err);
          await reply("Couldn't build that checklist right now — try again in a minute.");
        }
        break;
      }

      case 'stop':
        await deleteSubscriber(chatId);
        await reply('Stopped — no more reports or alerts. Send /start to turn them back on.');
        break;

      // --- fun ---------------------------------------------------------------

      case 'roll': {
        const dice = parseDice(command.args);
        if (dice.error) {
          await reply('🎲 Usage: /roll 2d6 — up to 10 dice with 2–1000 sides, e.g. /roll d20.');
          break;
        }
        const rolls = Array.from({ length: dice.n }, () => 1 + Math.floor(Math.random() * dice.m));
        const total = rolls.reduce((a, b) => a + b, 0);
        const detail = rolls.length > 1 ? `  (${rolls.join(' + ')})` : '';
        await reply(`🎲 ${dice.n}d${dice.m} → ${total}${detail}`);
        break;
      }

      case 'coin':
      case 'flip':
        await reply(Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!');
        break;

      case 'slots':
        await reply(buildSlotsReply(slotsSpin()));
        break;

      case 'joke':
        await reply(`😂 ${randomFrom(JOKES)}`);
        break;

      case 'riddle': {
        const today = localToday();
        await show(buildRiddleOfDay(riddleOfDay(today)), { parse_mode: 'HTML' });
        if (sub) await markSeen(eventKey('riddle', today));
        break;
      }

      case 'blackjack': {
        if (command.args.toLowerCase() === 'cancel') {
          await deleteGame(chatId);
          await reply('🃏 Game cancelled. /blackjack for a new one.');
          break;
        }
        const existing = await getGame(chatId);
        if (existing && !existing.state?.done) {
          if (existing.state?.game === 'poker') {
            await reply('🃏 You have a video-poker round going — continue there with /poker, or /poker cancel to drop it.');
            break;
          }
          const { text, keyboard } = renderGame(existing.state);
          await show(text, { reply_markup: keyboard });
          break;
        }
        const state = newGame();
        await saveGame(chatId, fromId ?? chatId, state);
        const { text, keyboard } = renderGame(state);
        await show(text, { reply_markup: keyboard });
        break;
      }

      case 'poker': {
        const arg = command.args.toLowerCase();
        if (arg === 'cancel') {
          await deleteGame(chatId);
          await reply('🃏 Round dropped. /poker for a fresh deal.');
          break;
        }
        const existing = await getGame(chatId);
        if (existing && !existing.state?.done) {
          if (existing.state?.game !== 'poker') {
            await reply('🃏 You have a blackjack game going — finish it or /blackjack cancel.');
            break;
          }
          const { text, keyboard } = renderPoker(existing.state);
          await show(text, { reply_markup: keyboard });
          break;
        }
        const state = newPokerGame();
        await saveGame(chatId, fromId ?? chatId, state);
        const { text, keyboard } = renderPoker(state);
        await show(text, { reply_markup: keyboard });
        break;
      }

      case 'watch': {
        const keyboard = {
          inline_keyboard: chunk(
            WATCH_GENRES.map((g) => ({ text: WATCH_LABELS[g] || g, callback_data: `watch:${g}` })),
            3,
          ),
        };
        await show('🎬 What should you watch tonight?\n\nPick a mood:', { reply_markup: keyboard });
        break;
      }

      case 'poll': {
        const parts = command.args.split('|').map((s) => s.trim()).filter(Boolean);
        if (parts.length < 3 || parts.length > 11) {
          await reply('📊 Usage: /poll Question | option A | option B — 2 to 10 options, separated by |.');
          break;
        }
        const [question, ...options] = parts;
        try {
          await api.sendPoll({
            chat_id: chatId,
            question,
            options: options.map((text) => ({ text })),
            is_anonymous: true,
          });
        } catch (err) {
          console.error('sendPoll failed', err);
          await reply('📊 Telegram rejected that poll — check the question and option lengths (question ≤ 300, options ≤ 100 chars).');
        }
        break;
      }

      // --- reminders ---------------------------------------------------------

      case 'events': {
        await reply(buildEventsList(await eventList()));
        break;
      }

      case 'event': {
        const parsed = parseEventArgs(command.args);
        if (parsed.error) {
          await reply(parsed.error);
          break;
        }
        if (parsed.list) {
          await reply(buildEventsList(await eventList()));
          break;
        }
        if (parsed.del != null) {
          const ok = await deleteEvent(chatId, parsed.del);
          await reply(ok ? `🗑 Removed #${parsed.del}.` : `No event #${parsed.del} — see /events.`);
          break;
        }
        const row = await insertEvent(chatId, parsed);
        const occ = nextOccurrence(row, localToday());
        const when = occ ? prettyOccurrence(occ.dateIso) : row.date;
        const emoji = row.kind === 'birthday' ? '🎂' : row.kind === 'anniversary' ? '💞' : '🎉';
        await reply(
          `${emoji} Saved #${row.id}: ${row.title} — ${when}. ` +
          `I'll remind you ${row.kind === 'event' ? 'a week before and ' : ''}the day before and on the day.`
        );
        break;
      }

      case 'gift': {
        const m = /^(\S+)\s*(.*)$/.exec(command.args);
        if (!m) {
          await reply('🎁 Usage: /gift <name> <interests> — e.g. /gift Sarah coffee, hiking, books');
          break;
        }
        await reply(buildGiftIdeas(m[1], suggestGifts(m[2], null)));
        break;
      }

      case 'memory': {
        const toks = command.args.split(/\s+/).filter(Boolean);
        if (toks[0] === 'del' || toks[0] === 'delete') {
          const id = Number(toks[1]);
          if (!Number.isInteger(id)) {
            await reply('Usage: /memory del <id> — ids are in /memory.');
            break;
          }
          const ok = await deleteMemory(chatId, id);
          await reply(ok ? `🗑 Memory #${id} removed.` : `No memory #${id} — see /memory.`);
          break;
        }
        const rows = (await listMemories(chatId)).sort((a, b) => b.id - a.id).slice(0, 5);
        if (!rows.length) {
          await reply('📸 Nothing saved yet — send me a photo (caption optional) and I\'ll bring it back on this day next year.');
          break;
        }
        const lines = ['📸 Saved memories', ''];
        for (const r of rows) {
          const cap = r.caption ? ` — ${r.caption.slice(0, 40)}${r.caption.length > 40 ? '…' : ''}` : '';
          lines.push(`#${r.id} · ${r.year}-${r.dayKey}${cap}`);
        }
        lines.push('', 'Remove one with /memory del <id>.');
        await reply(lines.join('\n'));
        break;
      }

      case 'contact': {
        const toks = command.args.split(/\s+/).filter(Boolean);
        const verb = (toks[0] || '').toLowerCase();
        if (verb === 'add') {
          const rest = toks.slice(1);
          let days = 30;
          if (rest.length > 1 && /^\d{1,3}$/.test(rest[rest.length - 1])) days = Number(rest.pop());
          const cname = rest.join(' ');
          if (!cname) {
            await reply('🤝 Usage: /contact add Sam [days] — e.g. /contact add Sam 30');
            break;
          }
          await insertContact(chatId, { name: cname, intervalDays: Math.max(1, days), lastContact: new Date() });
          await reply(`🤝 Tracking ${cname} — I'll nudge you once ${Math.max(1, days)} days pass without contact. Log a catch-up with /contacted ${cname}.`);
          break;
        }
        if (verb === 'del' || verb === 'delete') {
          const cname = toks.slice(1).join(' ');
          const c = cname ? await findContact(chatId, cname) : null;
          if (!c) {
            await reply('Usage: /contact del <name> — names are in /crm.');
            break;
          }
          await deleteContact(c.id);
          await reply(`🗑 No longer tracking ${c.name}.`);
          break;
        }
        const rows = await listContacts(chatId);
        if (!rows.length) {
          await reply('🤝 No contacts yet — add one: /contact add Sam 30');
          break;
        }
        const lines = ['🤝 Your people', ''];
        for (const r of rows.sort((a, b) => daysSince(b.lastContact) - daysSince(a.lastContact))) {
          lines.push(`${r.name} — last contact ${daysSince(r.lastContact)} days ago (every ${r.intervalDays})`);
        }
        lines.push('', 'Log a catch-up with /contacted <name>.');
        await reply(lines.join('\n'));
        break;
      }

      case 'contacted': {
        const cname = command.args.trim();
        if (!cname) {
          await reply('Usage: /contacted Sam — logs that you talked today.');
          break;
        }
        const c = await findContact(chatId, cname);
        if (!c) {
          await reply(`No contact named "${cname}" — add them with /contact add ${cname} 30.`);
          break;
        }
        await updateContact(c.id, { lastContact: new Date() });
        await reply(`🎉 Logged today's catch-up with ${c.name}.`);
        break;
      }

      case 'crm': {
        const rows = await listContacts(chatId);
        if (!rows.length) {
          await reply('🤝 No contacts yet — add one: /contact add Sam 30');
          break;
        }
        const overdue = dueContacts(rows, Date.now());
        if (!overdue.length) {
          await reply(`✅ Everyone's up to date — ${rows.length} ${rows.length === 1 ? 'person' : 'people'} tracked.`);
          break;
        }
        const lines = ['🤝 Overdue', ''];
        for (const { contact, daysSince: ds } of overdue.sort((a, b) => b.daysSince - a.daysSince)) {
          lines.push(`⚠️ ${contact.name} — ${ds} days (every ${contact.intervalDays})`);
        }
        lines.push('', 'Talk to someone? Log it with /contacted <name>.');
        await reply(lines.join('\n'));
        break;
      }

      // --- social ------------------------------------------------------------

      case 'confess': {
        if (chatType === 'group' || chatType === 'supergroup') {
          const arg = command.args.trim().toLowerCase();
          if (arg !== 'on' && arg !== 'off') {
            await reply('💌 /confess on — enable anonymous confessions here (admins only)\n/confess off — disable them');
            break;
          }
          if (!fromId) break;
          let member = null;
          try {
            member = await api.getChatMember({ chat_id: chatId, user_id: fromId });
          } catch (err) {
            console.warn('getChatMember failed', err && err.message);
          }
          const isAdmin = member && (member.status === 'administrator' || member.status === 'creator');
          if (!isAdmin) {
            await reply('🔒 Only group admins can do that.');
            break;
          }
          if (arg === 'on') {
            await setConfessionGroup(chatId);
            await reply('💌 Confessions are open. Anyone can DM me /confess <message> and I\'ll post it here — without their name.');
          } else {
            await clearConfessionGroup(chatId);
            await reply('🔒 Confessions off.');
          }
          break;
        }
        // In a private chat: send the confession to the group.
        const text = command.args.trim().slice(0, 2000);
        if (!text) {
          await reply('💌 Usage: /confess <message> — I\'ll post it to the confessions group, without your name.');
          break;
        }
        const g = await getConfessionGroup();
        if (!g) {
          await reply('💌 No group is accepting confessions right now. (A group admin enables them with /confess on.)');
          break;
        }
        try {
          await api.sendMessage({ chat_id: g.groupId, text: `💌 Anonymous confession\n\n${text}` });
          await reply('✅ Sent — posted anonymously.');
        } catch (err) {
          console.error('confession post failed', err);
          await reply("Couldn't post there — maybe I was removed from the group.");
        }
        break;
      }

      // --- travel budget -----------------------------------------------------

      case 'trip': {
        const arg = command.args.trim();
        if (!arg) {
          await reply(sub?.trip
            ? `💱 Current trip: ${sub.trip} — log spends with /spent 25 lunch · close with /trip end`
            : '💱 No active trip. Start one: /trip Tokyo');
          break;
        }
        if (arg.toLowerCase() === 'end') {
          await setTrip(chatId, null);
          await reply('💱 Trip closed. Totals stay in /budget.');
          break;
        }
        sub = await upsertSubscriber(chatId, { trip: arg });
        await reply(`💱 Trip started: ${arg}. Log spends like /spent 25 lunch.`);
        break;
      }

      case 'spent': {
        const toks = command.args.split(/\s+/).filter(Boolean);
        const amount = Number(toks[0]);
        if (!toks.length || !Number.isFinite(amount) || amount <= 0) {
          await reply('💰 Usage: /spent 25 lunch — amount first, then what it was.');
          break;
        }
        const trip = sub?.trip;
        if (!trip) {
          await reply('💱 Start a trip first: /trip Tokyo — then /spent 25 lunch.');
          break;
        }
        const note = toks.slice(1).join(' ') || null;
        const category = toks[1] ? toks[1].toLowerCase() : 'misc';
        await insertExpense(chatId, { trip, amount, category, note });
        const rows = (await listExpenses(chatId)).filter((r) => r.trip === trip);
        const total = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
        await reply(`💰 Logged ${amount} for ${note || 'misc'} — ${trip} total: ${total}`);
        break;
      }

      case 'budget': {
        const rows = await listExpenses(chatId);
        if (!rows.length) {
          await reply('💰 No expenses yet — start with /trip Tokyo, then /spent 25 lunch.');
          break;
        }
        const currentTrip = sub?.trip || rows[rows.length - 1].trip;
        const currentRows = rows.filter((r) => r.trip === currentTrip);
        const total = currentRows.reduce((s, r) => s + r.amount, 0);
        const byCat = {};
        for (const r of currentRows) byCat[r.category || 'misc'] = (byCat[r.category || 'misc'] || 0) + r.amount;
        const categories = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const byTrip = {};
        for (const r of rows) byTrip[r.trip] = (byTrip[r.trip] || 0) + r.amount;
        const history = Object.entries(byTrip).filter(([t]) => t !== currentTrip).sort((a, b) => b[1] - a[1]).slice(0, 5);
        await reply(buildBudgetReply({ trip: currentTrip, total, categories }, history));
        break;
      }

      default:
        await reply(helpText(name));
    }
  } else if (!menuHandled && message.text && !message.photo && !message.video) {
    // Plain text: a nudge when the city is missing, otherwise stay quiet.
    if (!sub) {
      await show(helpText(name), { reply_markup: mainKeyboard() });
    } else if (sub.lat == null || sub.lon == null) {
      await reply('📌 I still need your city — tap 📍 My location in the menu, or send /city <name>.');
    }
  }

  // The heartbeat: report + due alerts + reminders for this chat (skipped for
  // /stop). The row in hand is current — every mutation above re-assigned it —
  // so no second read: report, alerts and reminders share this one row.
  if (command?.cmd === 'stop' || heartbeatDone) return;
  if (!sub || sub.lat == null || sub.lon == null) return;
  try {
    await heartbeat(sub);
  } catch (err) {
    console.error('heartbeat failed', err);
  }
}
