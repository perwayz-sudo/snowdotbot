// Blackjack against the dealer — pure game logic + message rendering (no SDK
// imports). Randomness is injectable for tests.

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const HIT = 'bj:hit';
export const STAND = 'bj:stand';

function newDeck(random) {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  // Fisher–Yates.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// The shuffled 52-card deck — shared with video poker.
export { newDeck };

// Total with aces counted softly (11) until that would bust, then 1.
export function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    const rank = card.slice(0, -1);
    if (rank === 'A') {
      aces++;
      total += 11;
    } else if (rank === 'J' || rank === 'Q' || rank === 'K') {
      total += 10;
    } else {
      total += Number(rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function newGame(random = Math.random) {
  const deck = newDeck(random);
  const state = { game: 'blackjack', deck, player: [], dealer: [], done: false, result: null };
  state.player.push(deck.pop(), deck.pop());
  state.dealer.push(deck.pop(), deck.pop());
  if (handValue(state.player) === 21) {
    // Natural: dealer's hole card is revealed immediately.
    state.done = true;
    state.result = handValue(state.dealer) === 21 ? 'push' : 'blackjack';
  }
  return state;
}

export function hit(state) {
  if (state.done) return state;
  state.player.push(state.deck.pop());
  if (handValue(state.player) > 21) {
    state.done = true;
    state.result = 'bust';
  }
  return state;
}

export function stand(state) {
  if (state.done) return state;
  while (handValue(state.dealer) < 17) state.dealer.push(state.deck.pop());
  const p = handValue(state.player);
  const d = handValue(state.dealer);
  state.done = true;
  state.result = d > 21 || p > d ? 'win' : p === d ? 'push' : 'lose';
  return state;
}

const RESULT_LINE = {
  blackjack: '🎉 Blackjack! You win.',
  win: '🎉 You win!',
  lose: '😅 Dealer wins.',
  push: '🤝 Push — nobody wins.',
  bust: '💥 Bust! Dealer wins.',
};

export function renderGame(state) {
  const p = handValue(state.player);
  const hideHole = !state.done;
  const dealerShown = hideHole ? `${state.dealer[0]} 🂠` : state.dealer.join(' ');
  const lines = [
    '🃏 Blackjack — you vs the dealer',
    '',
    `You: ${state.player.join(' ')}  (${p})`,
    `Dealer: ${dealerShown}${state.done ? `  (${handValue(state.dealer)})` : ''}`,
  ];
  if (state.done) lines.push('', RESULT_LINE[state.result] || 'Game over.');
  else lines.push('', 'Hit or stand?');
  return {
    text: lines.join('\n'),
    keyboard: state.done
      ? { inline_keyboard: [] }
      : {
          inline_keyboard: [[
            { text: '🃏 Hit', callback_data: HIT },
            { text: '✋ Stand', callback_data: STAND },
          ]],
        },
  };
}
