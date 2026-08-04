/**
 * Analytics events for the Bhagya Card surface.
 *
 * One append-only table for the five product events (page_view, card_draw,
 * back_click, claim, consult_click). `coins` is filled only for claim.
 * `client_time` is the device clock at tap time; `created_at` (server clock)
 * is the one to trust for ordering and funnels.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('events', {
    id: 'bigserial',
    user_id: { type: 'text', notNull: true },
    event: { type: 'text', notNull: true },
    coins: { type: 'integer' },
    client_time: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('events', 'events_pkey', { primaryKey: ['id'] });
  pgm.createIndex('events', ['event', 'created_at']);
  pgm.createIndex('events', ['user_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('events');
};
