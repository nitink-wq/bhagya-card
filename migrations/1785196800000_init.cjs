/**
 * Initial schema for the Bhagya Card surface.
 *
 * Managed by node-pg-migrate (the standard migration tool for node-postgres).
 * Applied migrations are recorded in the `pgmigrations` table, so each
 * migration runs exactly once per database no matter how many times the
 * deploy job executes or how many pods are running.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // One row per product day (06:00 IST cutover). Marks the day's deck as
  // published; the cards hang off it.
  pgm.createTable('deck_days', {
    day: { type: 'date', primaryKey: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // The day's shared deck (~15 Gemini-generated cards, or the fallback).
  // Card ids are stable 1..N within the day so a user's seeded pick is
  // reproducible across re-opens.
  pgm.createTable('deck_cards', {
    day: { type: 'date', notNull: true, references: 'deck_days', onDelete: 'CASCADE' },
    card_id: { type: 'integer', notNull: true },
    title: { type: 'text', notNull: true },
    art_key: { type: 'text', notNull: true },
    theme: { type: 'text', notNull: true },
    fortune: { type: 'jsonb', notNull: true }, // exactly 2 lines
    finding: { type: 'text', notNull: true },
    consult_nudge: { type: 'text', notNull: true },
    prefill_question: { type: 'text', notNull: true },
  });
  pgm.addConstraint('deck_cards', 'deck_cards_pkey', {
    primaryKey: ['day', 'card_id'],
  });

  // One row per user: the forgiving streak. `progress` counts days the user
  // showed up (capped at streak length in logic); a missed day never resets
  // it. All draw decisions lock this row (SELECT ... FOR UPDATE).
  pgm.createTable('user_streaks', {
    user_id: { type: 'text', primaryKey: true },
    progress: { type: 'integer', notNull: true, default: 0 },
    last_draw_day: { type: 'date' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('user_streaks', 'user_streaks_progress_nonneg', {
    check: 'progress >= 0',
  });

  // The authoritative per-user per-day draw: which card came up, where the
  // user stood on the streak, what the day paid, and redemption state.
  // The (user_id, day) PK is what makes "one draw per day" structural.
  pgm.createTable('user_daily_draws', {
    user_id: { type: 'text', notNull: true },
    day: { type: 'date', notNull: true },
    card_id: { type: 'integer', notNull: true },
    pick_index: { type: 'integer', notNull: true, default: 0 }, // which of the 3 backs was tapped (display only)
    streak_day: { type: 'integer', notNull: true }, // snapshot of progress after this draw
    reward: { type: 'integer', notNull: true, default: 0 },
    redeem_ref: { type: 'text' },
    redeemed_at: { type: 'timestamptz' },
    redeemed_amount: { type: 'integer' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('user_daily_draws', 'user_daily_draws_pkey', {
    primaryKey: ['user_id', 'day'],
  });
  pgm.addConstraint('user_daily_draws', 'user_daily_draws_reward_nonneg', {
    check: 'reward >= 0',
  });
  pgm.createIndex('user_daily_draws', ['day']);

  // Fire-once gate + audit trail for wallet credits. The UNIQUE idempotency
  // key is what makes claim double-tap / retry safe end to end — the external
  // Coin API has no dedup of its own. Failed rows are the reconciliation
  // worklist (never auto-refired).
  pgm.createTable('coin_credit_attempts', {
    id: 'bigserial',
    idempotency_key: { type: 'text', notNull: true, unique: true },
    user_id: { type: 'text', notNull: true },
    day: { type: 'date', notNull: true },
    amount: { type: 'integer', notNull: true },
    status: { type: 'text', notNull: true }, // firing | success | failed | error | stub_credited
    http_status: { type: 'integer' },
    response: { type: 'jsonb' },
    error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('coin_credit_attempts', ['status']);
};

exports.down = (pgm) => {
  pgm.dropTable('coin_credit_attempts');
  pgm.dropTable('user_daily_draws');
  pgm.dropTable('user_streaks');
  pgm.dropTable('deck_cards');
  pgm.dropTable('deck_days');
};
