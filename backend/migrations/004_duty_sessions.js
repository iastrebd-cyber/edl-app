'use strict';

/**
 * Migration 004 — Duty Sessions
 *
 * Depends on: 003 (drivers), 002 (vehicles, users), 001 (carriers)
 *
 * duty_sessions — one row = one driver's 24-hour logbook day.
 *
 * FMCSA §395.8(j)(2) requires drivers to certify their daily record.
 * A session is "open" until the driver certifies it for that date.
 *
 * Key design decisions:
 *   - One session per driver per calendar date (home terminal date, not UTC)
 *   - Sessions are immutable after certification (certified_at IS NOT NULL)
 *   - Shipping documents and trailer numbers are recorded per-session
 *     because FMCSA requires them on the log (§395.8(d))
 *   - start_odometer / end_odometer allow per-day distance calculation
 */

exports.up = async (knex) => {

  await knex.schema.createTable('duty_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('driver_id').notNullable()
      .references('id').inTable('drivers').onDelete('RESTRICT');

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    // Vehicle can change mid-day (e.g. driver switches trucks at terminal)
    // The primary vehicle for this session
    t.uuid('vehicle_id')
      .references('id').inTable('vehicles').onDelete('SET NULL');

    // Co-driver on this session (team driving)
    t.uuid('co_driver_id')
      .references('id').inTable('drivers').onDelete('SET NULL');

    // ── Date & Timezone ─────────────────────────────────────────────────
    // The calendar date of this session in the driver's HOME TERMINAL timezone.
    // FMCSA defines a "day" by the carrier's home terminal timezone.
    t.date('session_date').notNullable();
    t.string('home_terminal_timezone', 60).notNullable();  // snapshot at session creation

    // ── FMCSA Required Log Fields (§395.8) ─────────────────────────────
    // Must appear on each day's log

    // Shipping document numbers (BOL, manifest, etc.) — comma-separated or JSON
    t.text('shipping_documents');          // e.g. "BOL-1234, BOL-5678"

    // Trailer numbers (can be multiple — doubles/triples)
    t.jsonb('trailer_numbers').defaultTo('[]');  // ["TR-001", "TR-002"]

    // Home terminal address (required on each log)
    t.string('home_terminal_address', 300);

    // Carrier address (if different from home terminal)
    t.string('carrier_address', 300);

    // ── Odometer & Engine Hours ─────────────────────────────────────────
    t.decimal('start_odometer', 10, 1);   // miles at start of session
    t.decimal('end_odometer', 10, 1);     // miles at end (null if still open)
    t.decimal('start_engine_hours', 8, 2);
    t.decimal('end_engine_hours', 8, 2);

    // ── Session Status ──────────────────────────────────────────────────
    t.enu('status', ['open', 'pending_certification', 'certified', 'amended'])
      .notNullable()
      .defaultTo('open');

    // FMCSA requires driver to certify (digitally sign) each day's log
    t.timestamp('certified_at');
    t.text('certification_signature');     // base64 encoded signature image or hash

    // If a certified session is subsequently amended (edit after cert)
    t.timestamp('amended_at');
    t.text('amendment_reason');

    // ── HOS snapshot at session close (for quick reporting) ─────────────
    // Pre-computed at session close to avoid re-scanning all events
    t.decimal('total_driving_hours', 5, 2);
    t.decimal('total_on_duty_hours', 5, 2);
    t.decimal('total_off_duty_hours', 5, 2);
    t.decimal('total_sleeper_hours', 5, 2);
    t.integer('violation_count').defaultTo(0);

    t.timestamps(true, true);

    // Unique: one session per driver per date
    t.unique(['driver_id', 'session_date']);
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    CREATE INDEX idx_sessions_driver      ON duty_sessions(driver_id);
    CREATE INDEX idx_sessions_carrier     ON duty_sessions(carrier_id);
    CREATE INDEX idx_sessions_vehicle     ON duty_sessions(vehicle_id);
    CREATE INDEX idx_sessions_date        ON duty_sessions(session_date DESC);
    CREATE INDEX idx_sessions_driver_date ON duty_sessions(driver_id, session_date DESC);
    CREATE INDEX idx_sessions_status      ON duty_sessions(status);
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('duty_sessions');
};
