// Pure helpers: moon phase (offline astronomy, no API).
//
// Simple mean-phase model — accurate to well under a day, plenty for a report line.

const SYNODIC = 29.530588853;                    // days per full cycle
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);   // a known new moon (2000-01-06 18:14 UTC)

export function moonInfo(nowMs) {
  const days = (nowMs - NEW_MOON) / 86400000;
  let age = days % SYNODIC;
  if (age < 0) age += SYNODIC;
  const f = age / SYNODIC;
  const illumination = ((1 - Math.cos(2 * Math.PI * f)) / 2) * 100;

  let name, emoji;
  if (f < 0.03 || f >= 0.97) [name, emoji] = ['New Moon', '🌑'];
  else if (f < 0.22) [name, emoji] = ['Waxing Crescent', '🌒'];
  else if (f < 0.28) [name, emoji] = ['First Quarter', '🌓'];
  else if (f < 0.47) [name, emoji] = ['Waxing Gibbous', '🌔'];
  else if (f < 0.53) [name, emoji] = ['Full Moon', '🌕'];
  else if (f < 0.72) [name, emoji] = ['Waning Gibbous', '🌖'];
  else if (f < 0.78) [name, emoji] = ['Last Quarter', '🌗'];
  else [name, emoji] = ['Waning Crescent', '🌘'];

  return { name, emoji, illumination };
}
