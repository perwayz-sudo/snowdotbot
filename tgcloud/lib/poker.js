// Video Poker — "Jacks or Better". Pure game logic + message rendering, same
// pattern as cards.js (blackjack). One round per chat lives in the games table;
// held cards toggle via inline buttons, then a single draw.
import { newDeck } from './cards.js';

export const PK_TOGGLE = 'pk:h:'; // + card index 0–4
export const PK_DRAW = 'pk:d';

const RANK_VALUE = { J: 11, Q: 12, K: 13, A: 14 };

function valueOf(card) {
  const rank = card.slice(0, -1);
  return RANK_VALUE[rank] ?? Number(rank);
}

// Standard Jacks-or-Better pay table (multiplier of a 1-coin bet).
export function evaluateHand(hand) {
  const values = hand.map(valueOf).sort((a, b) => a - b);
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = hand.every((c) => c.slice(-1) === hand[0].slice(-1));

  const uniq = [...new Set(values)];
  let straight = false;
  if (uniq.length === 5) {
    if (uniq[4] - uniq[0] === 4) straight = true;
    else if (uniq.join(',') === '2,3,4,5,14') straight = true; // the wheel (A-2-3-4-5)
  }

  if (straight && flush) {
    // Royal only for the A-high straight that starts at ten — the wheel
    // (A-2-3-4-5) is a plain straight flush.
    const royal = uniq[0] === 10 && uniq[4] === 14;
    return royal
      ? { name: 'Royal Flush', mult: 250 }
      : { name: 'Straight Flush', mult: 50 };
  }
  if (groups[0] === 4) return { name: 'Four of a Kind', mult: 25 };
  if (groups[0] === 3 && groups[1] === 2) return { name: 'Full House', mult: 9 };
  if (flush) return { name: 'Flush', mult: 6 };
  if (straight) return { name: 'Straight', mult: 4 };
  if (groups[0] === 3) return { name: 'Three of a Kind', mult: 3 };
  if (groups[0] === 2 && groups[1] === 2) return { name: 'Two Pair', mult: 2 };
  if (groups[0] === 2) {
    const pairValue = [...counts.entries()].find(([, n]) => n === 2)[0];
    return pairValue >= 11
      ? { name: 'Jacks or Better', mult: 1 }
      : { name: 'Low Pair', mult: 0 };
  }
  return { name: 'No Pair', mult: 0 };
}

export function newPokerGame(random = Math.random) {
  const deck = newDeck(random);
  const hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  return { game: 'poker', deck, hand, held: [false, false, false, false, false], done: false, result: null };
}

export function toggleHold(state, index) {
  if (state.done || !Number.isInteger(index) || index < 0 || index > 4) return state;
  state.held = state.held.map((h, i) => (i === index ? !h : h));
  return state;
}

export function draw(state) {
  if (state.done) return state;
  state.hand = state.hand.map((card, i) => (state.held[i] ? card : state.deck.pop()));
  state.done = true;
  state.result = evaluateHand(state.hand);
  return state;
}

export function renderPoker(state) {
  const lines = [
    '🃏 Video Poker — Jacks or Better',
    '',
    state.hand.join('  '),
  ];
  if (state.done) {
    const r = state.result;
    lines.push('', r.mult > 0 ? `🎉 ${r.name} — ${r.mult}× !` : `😅 ${r.name} this time.`);
    lines.push('', 'Deal again with /poker.');
    return { text: lines.join('\n'), keyboard: { inline_keyboard: [] } };
  }
  lines.push('', 'Tap cards to hold, then draw.');
  const cards = state.hand.map((card, i) => ({
    text: `${state.held[i] ? '✅' : '⬜'} ${card}`,
    callback_data: `${PK_TOGGLE}${i}`,
  }));
  return {
    text: lines.join('\n'),
    keyboard: { inline_keyboard: [cards, [{ text: '🔄 Draw', callback_data: PK_DRAW }]] },
  };
}
