// The tappable menu bar: persistent reply keyboards, the label → action map,
// and the command list registered with Telegram's ☰ menu. Pure — the handler
// only sends the keyboards and routes what `menuAction` returns.
//
// Button labels are plain text the user would otherwise type; the handler
// translates them back into commands, so nothing else had to change.

export const LOCATION_LABEL = '📍 My location';

// Five rows of three-four buttons. The 📍 button uses request_location — no
// text is sent, Telegram shares the pin straight away.
export const MAIN_MENU = [
  ['☀️ Report', '🌧 Rain', '🫁 Air'],
  ['🏃 Workout', '🌌 Sky', '🚴 Commute'],
  ['📅 Events', '🤝 People', '📸 Memories'],
  ['🧳 Travel', '💰 Budget', '🎲 Fun'],
  [LOCATION_LABEL, '⚙️ Setup', '❓ Help', '🙈 Hide'],
];

export const FUN_MENU = [
  ['🎲 Dice', '🪙 Coin', '🎰 Slots'],
  ['😂 Joke', '🧩 Riddle', '🃏 Blackjack'],
  ['♠️ Poker', '🎬 Watch', '📊 Poll'],
  ['⬅️ Back'],
];

// What each label does:
//   { cmd }  → runs that command
//   { fun }  → swaps the bar to the fun submenu
//   { main } → swaps the bar back to the main menu
//   { hide } → removes the bar (ReplyKeyboardRemove)
//   { info } → sends a short usage note (needs arguments, so it can't just run)
const ACTIONS = {
  '☀️ Report': { cmd: 'report' },
  '🌧 Rain': { cmd: 'rain' },
  '🫁 Air': { cmd: 'air' },
  '🏃 Workout': { cmd: 'workout' },
  '🌌 Sky': { cmd: 'sky' },
  '🚴 Commute': { cmd: 'commute' },
  '📅 Events': { cmd: 'events' },
  '🤝 People': { cmd: 'crm' },
  '📸 Memories': { cmd: 'memory' },
  '🧳 Travel': { info: 'travel' },
  '💰 Budget': { cmd: 'budget' },
  '🎲 Fun': { fun: true },
  '⚙️ Setup': { info: 'setup' },
  '❓ Help': { cmd: 'help' },
  '🙈 Hide': { hide: true },
  // Fun submenu.
  '🎲 Dice': { cmd: 'roll' },
  '🪙 Coin': { cmd: 'coin' },
  '🎰 Slots': { cmd: 'slots' },
  '😂 Joke': { cmd: 'joke' },
  '🧩 Riddle': { cmd: 'riddle' },
  '🃏 Blackjack': { cmd: 'blackjack' },
  '♠️ Poker': { cmd: 'poker' },
  '🎬 Watch': { cmd: 'watch' },
  '📊 Poll': { info: 'poll' },
  '⬅️ Back': { main: true },
};

export function menuAction(text) {
  return ACTIONS[String(text || '').trim()] || null;
}

export function mainKeyboard() {
  return {
    keyboard: MAIN_MENU.map((row) =>
      row.map((label) => (label === LOCATION_LABEL ? { text: label, request_location: true } : { text: label })),
    ),
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Tap a button — or type a message',
  };
}

export function funKeyboard() {
  return {
    keyboard: FUN_MENU.map((row) => row.map((label) => ({ text: label }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function hideKeyboard() {
  return { remove_keyboard: true };
}

// The ☰ menu list (setMyCommands). A curated subset — /help has the rest.
export const BOT_COMMANDS = [
  { command: 'menu', description: 'Open the button menu' },
  { command: 'report', description: 'Weather report now' },
  { command: 'rain', description: 'When the rain starts' },
  { command: 'air', description: 'Air quality — AQI, PM2.5' },
  { command: 'uv', description: 'UV index now' },
  { command: 'workout', description: 'Best time to run today' },
  { command: 'sky', description: 'Stargazing tonight' },
  { command: 'commute', description: 'Commute forecast' },
  { command: 'city', description: 'Set your city' },
  { command: 'weather', description: 'Forecast for any city + date' },
  { command: 'pack', description: 'Packing checklist for a trip' },
  { command: 'events', description: 'Birthdays & countdowns' },
  { command: 'contact', description: 'Track friends you owe a hello' },
  { command: 'memory', description: 'Photo memories from past years' },
  { command: 'trip', description: 'Travel budget — start a trip' },
  { command: 'budget', description: 'Trip spending summary' },
  { command: 'poll', description: 'Group poll: Question | A | B' },
  { command: 'blackjack', description: 'Blackjack vs the dealer' },
  { command: 'poker', description: 'Video poker' },
  { command: 'watch', description: 'What to watch tonight' },
  { command: 'help', description: 'All commands' },
];

// In groups the fun/utility list is shorter and `confess` shows up.
export const BOT_COMMANDS_GROUP = [
  { command: 'menu', description: 'Open the button menu' },
  { command: 'report', description: 'Weather report now' },
  { command: 'rain', description: 'When the rain starts' },
  { command: 'poll', description: 'Group poll: Question | A | B' },
  { command: 'confess', description: 'Anonymous confessions (admins)' },
  { command: 'events', description: 'Birthdays & countdowns' },
  { command: 'blackjack', description: 'Blackjack vs the dealer' },
  { command: 'poker', description: 'Video poker' },
  { command: 'watch', description: 'What to watch tonight' },
  { command: 'joke', description: 'Random joke' },
  { command: 'city', description: 'Set the group’s city' },
  { command: 'help', description: 'All commands' },
];
