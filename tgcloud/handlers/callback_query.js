// handlers/callback_query.js — inline-button taps.
//
// Blackjack: "bj:hit" / "bj:stand" — only the player who started the game may
// tap; every tap edits the game message in place.
// Watch: "watch:<genre>" picks from that genre; "watch:<genre>:again" re-rolls.
import { api } from 'sdk';
import { getGame, saveGame, deleteGame } from '../lib/store.js';
import { HIT, hit, renderGame, stand } from '../lib/cards.js';
import { PK_DRAW, PK_TOGGLE, draw, renderPoker, toggleHold } from '../lib/poker.js';
import { WATCH, randomFrom } from '../lib/content.js';
import { buildWatchReply } from '../lib/format.js';

const answer = (query, text, showAlert) => {
  const payload = { callback_query_id: query.id };
  if (text) payload.text = text;
  if (showAlert) payload.show_alert = true;
  return api
    .answerCallbackQuery(payload)
    .catch((err) => console.warn('answerCallbackQuery failed', err && err.message));
};

export default async function (query) {
  const data = String(query.data || '');
  const message = query.message;
  if (!message) {
    await answer(query, undefined);
    return;
  }
  const chatId = message.chat.id;

  if (data.startsWith('bj:')) {
    if (!query.from) {
      await answer(query, 'Something went wrong — try /blackjack.', true);
      return;
    }
    const game = await getGame(chatId);
    if (!game || game.state?.done || game.state?.game === 'poker') {
      await answer(query, 'That game is over — /blackjack for a new one.', true);
      return;
    }
    if (game.owner !== query.from.id) {
      await answer(query, 'That game belongs to someone else — /blackjack starts your own.', true);
      return;
    }
    const state = data === HIT ? hit(game.state) : stand(game.state);
    if (state.done) await deleteGame(chatId);
    else await saveGame(chatId, game.owner, state);
    const { text, keyboard } = renderGame(state);
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text,
        reply_markup: keyboard,
      });
    } catch (err) {
      console.warn('editMessageText failed', err && err.message);
    }
    await answer(query);
    return;
  }

  if (data.startsWith('pk:')) {
    if (!query.from) {
      await answer(query, 'Something went wrong — try /poker.', true);
      return;
    }
    const game = await getGame(chatId);
    if (!game || game.state?.done || game.state?.game !== 'poker') {
      await answer(query, 'That round is over — /poker for a new deal.', true);
      return;
    }
    if (game.owner !== query.from.id) {
      await answer(query, 'That round belongs to someone else — /poker deals your own.', true);
      return;
    }
    if (data === PK_DRAW) {
      draw(game.state);
      await deleteGame(chatId);
    } else if (data.startsWith(PK_TOGGLE)) {
      toggleHold(game.state, Number(data.slice(PK_TOGGLE.length)));
      await saveGame(chatId, game.owner, game.state);
    } else {
      await answer(query);
      return;
    }
    const { text, keyboard } = renderPoker(game.state);
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text,
        reply_markup: keyboard,
      });
    } catch (err) {
      console.warn('editMessageText failed', err && err.message);
    }
    await answer(query);
    return;
  }

  if (data.startsWith('watch:')) {
    const [, genre] = data.split(':');
    const list = WATCH[genre];
    if (!list) {
      await answer(query, 'Unknown genre — /watch to start over.', true);
      return;
    }
    const pick = randomFrom(list);
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text: buildWatchReply(genre, pick),
        reply_markup: {
          inline_keyboard: [[{ text: '🎲 Another', callback_data: `watch:${genre}:again` }]],
        },
      });
    } catch (err) {
      console.warn('editMessageText failed', err && err.message);
    }
    await answer(query);
    return;
  }

  await answer(query);
}
