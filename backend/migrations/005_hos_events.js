'use strict';

/**
 * Migration 005 — HOS Events  ⬅ CRITICAL FMCSA TABLE
 *
 * Depends on: 004 (duty_sessions), 003 (drivers), 002 (vehicles)
 *
 * hos_events — the immutable, append-only log of every duty status change.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FMCSA §395.26 — Data Recording Requirements
 *
 *  Every row is a "ELD Event Record". The spec defines 5 event types:
 *
 *    event_type = 1  Duty Status Change    (OFF/SB/D/ON transitions)
 *    event_type = 2  Intermediate Log      (position ping every 60 min while Driving)
 *    event_type = 3  Driver Login/Logout   (identifies the authenticated driver)
 *    event_type = 4  CMV Power On/Off      (ignition events)
 *    event_type = 5  Malfunction/Diagnostic (hardware faults per §395.34)
 *
 *  event_code depends on event_type:
 *    For type 1 (Duty Status): 1=OFF  2=SB  3=D  4=ON
 *    For type 3 (Login):       1=Login  2=Logout
 *    For type 4 (Power):       1=Power-on  2=Power-off  3=Engine-on  4=Engine-off
 *    For type 5 (Malfunction):
 *      codes P,E,T,L,R,S,O = malfunction types
 *      codes 1–6            = data diagnostic types
 *
 *  record_origin — who/what created this record:
 *    '1' = automatically recorded by ELD
 *    '2' = edited or entered by driver
 *    '3' = edited by authenticated user (dispatcher/admin)
 *    '4' = unidentified driver profile (auto-recorded, driver not logged in)
 *
 *  record_status — lifecycle of this record:
 *    '1' = active
 *    '2' = inactive – changed (superseded by an edit)
 *    '3' = inactive – deactivated
 *    '4' = inactive – change requested (pending driver acceptance)
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IMMUTABILITY RULE (CRITICAL):
 *
 *  NEVER UPDATE OR DELETE rows in this table.
 *
 *  When a driver corrects a log entry:
 *    1. Set the old row's record_status = '2' (inactive-changed)
 *    2. INSERT a new row with:
 *         record_origin  = '2' (driver edit)
 *         original_event_id = old row's id
 *         edit_reason    = driver's explanation (required by FMCSA)
 *    3. Driver must certify the change (update duty_sessions.status = 'amended')
 *
 *  This preserves the full audit trail required by §395.8(i).
 * ══════════════════════════════════════════════════════════════════════════
 */

exports.up = async (knex) => {

  await knex.schema.createTable('hos_events', (t) => {
    // UUID is required by FMCSA for data transfer file uniqueness
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // ── Parent References ───────────────────────────────────────────────
    t.uuid('session_id').notNullable()
      .references('id').inTable('duty_sessions').onDelete('RESTRICT');

    t.uuid('driver_id').notNullable()
      .references('id').inTable('drivers').onDelete('RESTRICT');

    t.uuid('vehicle_id')
      .references('id').inTable('vehicles').onDelete('RESTRICT');

    // Co-driver present at time of event
    t.uuid('co_driver_id')
      .references('id').inTable('drivers').onDelete('SET NULL');

    // ── FMCSA Core Event Fields ─────────────────────────────────────────
    t.smallint('event_type').notNullable();         // 1–5 per spec
    t.string('event_code', 2).notNullable();         // duty status or sub-code

    // All times stored in UTC. Display in driver's home terminal timezone.
    t.timestamp('event_datetime', { useTz: true }).notNullable();

    // ── Location (required for every event) ────────────────────────────
    // Precision: ≤1 mile (FMCSA §395.26(b)(4)) — 6 decimal places gives ~0.1m
    t.decimal('latitude', 9, 6);
    t.decimal('longitude', 9, 6);
    // Human-readable location (auto-reverse-geocoded), max 60 chars per spec
    t.string('location_description', 60);
    // When GPS is unavailable, store last known coordinates (spec allows this)
    t.boolean('location_is_estimated').notNullable().defaultTo(false);

    // ── Odometer & Engine Hours ─────────────────────────────────────────
    // Distance since last valid event (tenths of a mile, per spec)
    t.decimal('distance_since_last', 8, 1).notNullable().defaultTo(0);
    // Cumulative vehicle miles (from ECM odometer)
    t.decimal('accumulated_miles', 10, 1).notNullable().defaultTo(0);
    // Cumulative engine hours (from ECM)
    t.decimal('engine_hours', 8, 2).notNullable().defaultTo(0);

    // ── Record Metadata ─────────────────────────────────────────────────
    // Monotonically increasing per driver per day — used in ELD output file
    t.integer('sequence_id').notNullable().defaultTo(1);
    t.string('record_origin', 1).notNullable().defaultTo('1');
    t.string('record_status', 1).notNullable().defaultTo('1');

    // ── Edit Chain (for FMCSA edit audit trail) ─────────────────────────
    // If this row is an edit, points to the row it replaces
    t.uuid('original_event_id')
      .references('id').inTable('hos_events').onDelete('RESTRICT');
    // Required by FMCSA when record_origin = '2' or '3'
    t.text('edit_reason');
    // User who made the edit (if not the driver)
    t.uuid('edited_by_user_id')
      .references('id').inTable('users').onDelete('SET NULL');

    // ── Malfunctions & Diagnostics (event_type = 5) ─────────────────────
    // Malfunction codes: P E T L R S O
    t.string('malfunction_code', 1);
    // Diagnostic codes: 1 2 3 4 5 6
    t.string('data_diagnostic_code', 2);
    // '1' = malfunction, '2' = data diagnostic
    t.string('malfunction_indicator', 1);

    // ── Annotations ─────────────────────────────────────────────────────
    // Driver note (e.g. "Adverse driving conditions — unexpected snowstorm")
    t.text('annotation');

    // Personal Conveyance / Yard Move sub-status
    // Applied to OFF or ON events to indicate special PC/YM use
    t.enu('special_condition', ['personal_conveyance', 'yard_move']).nullable();

    // ── Canadian ELD Fields ─────────────────────────────────────────────
    // Jurisdiction at time of event (determines which HOS rules apply)
    t.enu('jurisdiction', ['us', 'ca']).notNullable().defaultTo('us');
    // Canadian deferral applied to this event
    t.boolean('canada_deferral_applied').notNullable().defaultTo(false);

    // ── Timestamp ───────────────────────────────────────────────────────
    // created_at is the wall-clock time the server received and stored this record.
    // NOT the event_datetime (which is the time the event actually occurred).
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // NOTE: NO updated_at — this table is append-only. Never run UPDATE here.
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // Selected to optimize the most frequent query patterns:
  //   1. "Get all events for driver for last 8 days" (HOS calculation)
  //   2. "Get all events for a session" (logbook display)
  //   3. "Get active events" (excludes soft-deleted / superseded)
  //   4. "Get events for inspector transfer" (event_datetime range)
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    -- Most critical: HOS calculator scans events by driver + time range
    CREATE INDEX idx_hos_events_driver_time
      ON hos_events(driver_id, event_datetime DESC);

    -- Logbook UI: get events for a session
    CREATE INDEX idx_hos_events_session
      ON hos_events(session_id, event_datetime ASC);

    -- Filter by active-only (excludes inactive-changed records)
    CREATE INDEX idx_hos_events_status
      ON hos_events(record_status)
      WHERE record_status = '1';

    -- Edit chain: find all edits that reference an original event
    CREATE INDEX idx_hos_events_original
      ON hos_events(original_event_id)
      WHERE original_event_id IS NOT NULL;

    -- Vehicle events (for FMCSA file generation by vehicle)
    CREATE INDEX idx_hos_events_vehicle
      ON hos_events(vehicle_id, event_datetime DESC);

    -- Malfunctions only (for malfunction/diagnostic reports)
    CREATE INDEX idx_hos_events_malfunction
      ON hos_events(driver_id, malfunction_code)
      WHERE event_type = 5;

    -- Sequence integrity check: enforce unique sequence_id per session
    CREATE UNIQUE INDEX idx_hos_events_sequence
      ON hos_events(session_id, sequence_id);
  `);

  // ─────────────────────────────────────────────
  // CHECK CONSTRAINTS
  // Enforce valid FMCSA codes at the database level
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    ALTER TABLE hos_events
      ADD CONSTRAINT chk_event_type
        CHECK (event_type BETWEEN 1 AND 5),
      ADD CONSTRAINT chk_record_origin
        CHECK (record_origin IN ('1','2','3','4')),
      ADD CONSTRAINT chk_record_status
        CHECK (record_status IN ('1','2','3','4')),
      ADD CONSTRAINT chk_malfunction_code
        CHECK (malfunction_code IN ('P','E','T','L','R','S','O') OR malfunction_code IS NULL),
      ADD CONSTRAINT chk_edit_reason_required
        CHECK (
          (record_origin IN ('2','3') AND edit_reason IS NOT NULL)
          OR record_origin IN ('1','4')
        );
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('hos_events');
};
