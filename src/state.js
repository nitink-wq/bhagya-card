// Core server-authoritative state machine.
//
// The client can only *request* a draw or a claim; every decision — whether a
// draw is allowed, which card comes up, the streak position, the reward
// amount, redemption — is made and recorded here inside DB transactions with
// row locks, so it is correct under concurrent requests from any number of
// pods and immune to client tampering, replay, or refresh-farming.
//
// Streak model ("progress, not punishment"): streak progress is the count of
// days the user has shown up, capped at streak.length. A missed day never
// resets it. Rewards fire the first time a given progress value is reached
// (config streak.rewards maps progress -> coins; the plan's D0/D3/D7 chips
// are draws #1/#4/#7). Post-D7 the daily draw continues with no coins.
import { createHash } from 'node:crypto';
import { query, withTx } from './db.js';
import { loadConfig } from './config.js';
import { todayKey, nextResetAt } from './day.js';
import { fireCoinCredit } from './coin-api.js';

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidUserId(id) {
  return typeof id === 'string' && USER_ID_RE.test(id);
}

export class StateError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// The pick is the trick: the user taps one of three face-down cards, but the
// revealed card is the seeded deck pick — stable across re-opens the same
// day and different from the neighbour's.
function seededCardIndex(userId, day, deckSize) {
  const digest = createHash('sha256').update(`${userId}:${day}`).digest();
  return digest.readUInt32BE(0) % deckSize;
}

// ---------------------------------------------------------------------------
// Deck access
async function fetchDeckDay(executor, day) {
  const { rows } = await executor.query('SELECT day FROM deck_days WHERE day = $1', [day]);
  return rows[0] || null;
}

async function fetchDeckCards(executor, day) {
  const { rows } = await executor.query(
    `SELECT card_id, title, art_key, theme, fortune, finding, consult_nudge, prefill_question
       FROM deck_cards WHERE day = $1 ORDER BY card_id`,
    [day],
  );
  return rows;
}

async function readDraw(executor, userId, day) {
  const { rows } = await executor.query(
    'SELECT * FROM user_daily_draws WHERE user_id = $1 AND day = $2',
    [userId, day],
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Session payload — the only shape the client ever renders.
function buildConsultUrl(cfg, day, card) {
  const base = cfg.consultTarget.deeplink;
  const params = new URLSearchParams({
    src: cfg.experimentKey,
    day,
    card: card.title,
    prefill: card.prefill_question,
  });
  return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
}

function buildSessionPayload({ cfg, day, cards, draw, streak }) {
  const streakLength = cfg.streak.length;
  const progress = streak ? Math.min(streak.progress, streakLength) : 0;
  const card = draw ? cards.find((c) => c.card_id === draw.card_id) || null : null;

  const checkpoints = Array.from({ length: streakLength }, (_, i) => {
    const dayN = i + 1;
    const reward = cfg.streak.rewards[String(dayN)] || 0;
    let state = 'upcoming';
    if (dayN <= progress) state = 'done';
    else if (dayN === progress + 1 && !draw) state = 'today';
    return { day: dayN, reward, state };
  });

  const claimed = Boolean(draw && draw.redeemed_at);
  const rewardAmount = draw ? draw.reward : 0;
  const streakComplete = progress >= streakLength;

  return {
    day,
    nextResetAt: nextResetAt().toISOString(),
    serverNow: new Date().toISOString(),
    streak: { length: streakLength, progress, checkpoints, complete: streakComplete },
    drawn: Boolean(draw),
    pickIndex: draw ? draw.pick_index : null,
    card: card && {
      title: card.title,
      artKey: card.art_key,
      // Decorative deck numeral, from the catalogue — the card face shows it.
      numeral: (cfg.deck.catalogue[card.art_key] || {}).numeral || '',
      theme: card.theme,
      fortune: card.fortune,
      finding: card.finding,
      consultNudge: card.consult_nudge,
      prefillQuestion: card.prefill_question,
      consultUrl: buildConsultUrl(cfg, day, card),
    },
    reward: {
      amount: rewardAmount,
      claimed,
      claimable: rewardAmount > 0 && !claimed,
    },
    // Post-D7 note shows when the journey is complete and today pays nothing.
    postStreak: Boolean(draw && streakComplete && rewardAmount === 0),
    copy: cfg.copy,
    art: cfg.art,
    astrologer: cfg.astrologer,
  };
}

async function readStreak(executor, userId) {
  const { rows } = await executor.query(
    'SELECT * FROM user_streaks WHERE user_id = $1',
    [userId],
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Public operations

export async function getSession(userId) {
  const cfg = loadConfig();
  const day = todayKey();
  const deckDay = await fetchDeckDay({ query }, day);
  if (!deckDay) throw new StateError('POOL_MISSING', `no deck for ${day}`);
  const [cards, draw, streak] = await Promise.all([
    fetchDeckCards({ query }, day),
    readDraw({ query }, userId, day),
    readStreak({ query }, userId),
  ]);
  return buildSessionPayload({ cfg, day, cards, draw, streak });
}

// One draw per product day. Idempotent: a second draw request the same day
// (double-tap, refresh, another pod) returns the existing draw unchanged.
export async function draw(userId, pickIndex) {
  const cfg = loadConfig();
  const day = todayKey();
  const pick = Number.isInteger(pickIndex) && pickIndex >= 0 && pickIndex <= 2 ? pickIndex : 0;

  return withTx(async (client) => {
    const deckDay = await fetchDeckDay(client, day);
    if (!deckDay) throw new StateError('POOL_MISSING', `no deck for ${day}`);
    const cards = await fetchDeckCards(client, day);
    if (cards.length === 0) throw new StateError('POOL_MISSING', `empty deck for ${day}`);

    // Insert-if-absent then lock. ON CONFLICT DO NOTHING makes concurrent
    // first-touch from two pods safe; FOR UPDATE serializes everything after.
    await client.query(
      `INSERT INTO user_streaks (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const { rows: streakRows } = await client.query(
      'SELECT * FROM user_streaks WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    const streak = streakRows[0];

    const existing = await readDraw(client, userId, day);
    if (existing) {
      return {
        alreadyDrawn: true,
        session: buildSessionPayload({ cfg, day, cards, draw: existing, streak }),
      };
    }

    const newProgress = Math.min(streak.progress + 1, cfg.streak.length);
    // Reward only on the first arrival at a checkpoint: progress increments
    // at most once per day and never decreases, so each configured amount can
    // pay at most once per user, ever.
    const reward = newProgress > streak.progress
      ? (cfg.streak.rewards[String(newProgress)] || 0)
      : 0;
    const cardIndex = seededCardIndex(userId, day, cards.length);

    const inserted = await client.query(
      `INSERT INTO user_daily_draws (user_id, day, card_id, pick_index, streak_day, reward)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, day) DO NOTHING
       RETURNING *`,
      [userId, day, cards[cardIndex].card_id, pick, newProgress, reward],
    );
    if (inserted.rowCount !== 1) {
      throw new StateError('CONFLICT', 'concurrent draw detected, retry');
    }
    // Guarded update: WHERE re-checks the pre-lock progress so even a bug
    // above could never double-advance the streak.
    const updated = await client.query(
      `UPDATE user_streaks
          SET progress = $2, last_draw_day = $3, updated_at = now()
        WHERE user_id = $1 AND progress = $4`,
      [userId, newProgress, day, streak.progress],
    );
    if (updated.rowCount !== 1) {
      throw new StateError('CONFLICT', 'concurrent draw detected, retry');
    }

    const session = buildSessionPayload({
      cfg, day, cards,
      draw: inserted.rows[0],
      streak: { ...streak, progress: newProgress },
    });
    return { alreadyDrawn: false, reward, streakDay: newProgress, session };
  });
}

// Claim today's streak reward. Two phases (record-first, fire-once):
// phase 1 marks the row redeemed under a row lock (kills double-taps),
// phase 2 fires the Coin API behind a UNIQUE idempotency-key gate — the
// external API has no dedup of its own, so the gate is the only protection.
// Unclaimed rewards expire with the product day, same as daily-cast.
export async function claim(userId) {
  const cfg = loadConfig();
  const day = todayKey();

  const marked = await withTx(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM user_daily_draws WHERE user_id = $1 AND day = $2 FOR UPDATE',
      [userId, day],
    );
    const row = rows[0];
    if (!row) throw new StateError('NOTHING_TO_CLAIM', 'no draw today');
    const idempotencyKey = row.redeem_ref || `${cfg.experimentKey}:${userId}:${day}`;
    if (row.redeemed_at) {
      return { alreadyClaimed: true, amount: row.redeemed_amount || 0, idempotencyKey };
    }
    if (row.reward <= 0) throw new StateError('NOTHING_TO_CLAIM', 'no reward today');
    // Amount comes from server state only; the client never submits it.
    const amount = row.reward;
    await client.query(
      `UPDATE user_daily_draws
          SET redeem_ref = $3, redeemed_at = now(), redeemed_amount = $4
        WHERE user_id = $1 AND day = $2`,
      [userId, day, idempotencyKey, amount],
    );
    return { alreadyClaimed: false, amount, idempotencyKey };
  });

  // Fired on every claim (repeats included) so a crash between phases
  // self-heals on the next tap; the gate suppresses anything after the first.
  await fireCoinCredit({ userId, day, amount: marked.amount, idempotencyKey: marked.idempotencyKey });

  const cards = await fetchDeckCards({ query }, day);
  const [drawRow, streak] = await Promise.all([
    readDraw({ query }, userId, day),
    readStreak({ query }, userId),
  ]);
  return {
    alreadyClaimed: marked.alreadyClaimed || undefined,
    claimedAmount: marked.amount,
    session: buildSessionPayload({ cfg, day, cards, draw: drawRow, streak }),
  };
}
