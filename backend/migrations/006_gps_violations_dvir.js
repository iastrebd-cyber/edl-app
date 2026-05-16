'use strict';

/**
 * Migration 006 — GPS Breadcrumbs + Violations + DVIR Reports
 *
 * Depends on: 005 (hos_events), 004 (duty_sessions), 003 (drivers), 002 (vehicles)
 *
 * Three supporting tables:
 *
 *   gps_breadcrumbs — continuous position log (every ~60s while vehicle moving)
 *   violations      — detected HOS violations (computed by violation-detector service)
 *   dvir_reports    — Driver Vehicle Inspection Reports (pre/post-trip)
 */

exports.up = async (knex) => {

  // ─────────────────────────────────────────────
  // TABLE: gps_breadcrumbs
  //
  // Stores the vehicle's position trail at regular intervals.
  // Separate from hos_events because:
  //   1. Much higher volume (every 60s vs only on status change)
  //   2. Not required by FMCSA per event — just position at event time
  //   3. Enables fleet map animation and historical route replay
  //
  // FMCSA requires intermediate logs (event_type=2) every 60 min while Driving —
  // those go into hos_events. This table is the between-event position trail.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('gps_breadcrumbs', (t) => {
    // Use bigint serial for high-volume insert performance
    t.bigIncrements('id').primary();

    t.uuid('vehicle_id').notNullable()
      .references('id').inTable('vehicles').onDelete('CASCADE');

    t.uuid('driver_id')
      .references('id').inTable('drivers').onDelete('SET NULL');

    t.uuid('session_id')
      .references('id').inTable('duty_sessions').onDelete('SET NULL');

    // Position
    t.decimal('latitude', 9, 6).notNullable();
    t.decimal('longitude', 9, 6).notNullable();
    t.decimal('accuracy_meters', 6, 1);     // GPS accuracy radius

    // Motion
    t.decimal('speed_mph', 5, 1);           // speed from ECM/GPS
    t.smallint('heading');                  // 0–359 degrees

    // ECM readings at this point
    t.decimal('odometer', 10, 1);
    t.decimal('engine_hours', 8, 2);

    // Source of this fix
    t.enu('source', ['gps', 'ecm', 'network']).notNullable().defaultTo('gps');

    t.timestamp('recorded_at', { useTz: true }).notNullable();

    // NO updated_at — append-only
  });

  // ─────────────────────────────────────────────
  // TABLE: violations
  //
  // Computed by violation-detector service after each hos_event INSERT.
  // Stores detected HOS rule violations with severity.
  //
  // Violation types (violation_type values):
  //   'driving_11h'        — exceeded 11-hour driving limit
  //   'shift_14h'          — exceeded 14-hour on-duty window
  //   'break_30min'        — missed required 30-minute break
  //   'cycle_70h'          — exceeded 70-hour / 8-day cycle
  //   'cycle_60h'          — exceeded 60-hour / 7-day cycle
  //   'canada_driving_13h' — exceeded 13-hour Canadian driving limit
  //   'canada_cycle_120h'  — exceeded Canadian 120h / 14-day cycle
  //   'restart_invalid'    — 34-hour restart did not include 2x 1am-5am periods
  //   'falsification'      — driving recorded without ELD login
  //   'malfunction_p'      — power malfunction unresolved > 30 min
  //   'malfunction_e'      — ECM sync malfunction
  //   (etc. for all FMCSA malfunction codes)
  // ─────────────────────────────────────────────
  await knex.schema.createTable('violations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('driver_id').notNullable()
      .references('id').inTable('drivers').onDelete('CASCADE');

    t.uuid('session_id').notNullable()
      .references('id').inTable('duty_sessions').onDelete('CASCADE');

    // The specific HOS event that triggered this violation (nullable for cycle violations)
    t.uuid('trigger_event_id')
      .references('id').inTable('hos_events').onDelete('SET NULL');

    t.string('violation_type', 50).notNullable();

    // warning = approaching limit, violation = limit exceeded
    t.enu('severity', ['warning', 'violation']).notNullable();

    // When the violation occurred (may differ from trigger_event_id timestamp)
    t.timestamp('occurred_at', { useTz: true }).notNullable();

    // How many minutes/hours over the limit
    t.decimal('overage_minutes', 8, 2);

    // Human-readable description for the dispatcher alert panel
    t.text('description');

    // Dispatcher acknowledgement
    t.boolean('acknowledged').notNullable().defaultTo(false);
    t.timestamp('acknowledged_at');
    t.uuid('acknowledged_by')
      .references('id').inTable('users').onDelete('SET NULL');

    // If violation was resolved (e.g. driver went off duty after the fact)
    t.boolean('resolved').notNullable().defaultTo(false);
    t.timestamp('resolved_at');

    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // TABLE: dvir_reports
  //
  // Driver Vehicle Inspection Reports — required by FMCSA §396.11
  // Drivers must complete a pre-trip and post-trip inspection each day.
  //
  // defects JSON structure:
  //   [
  //     {
  //       "component": "Brakes",
  //       "location": "Front left",
  //       "description": "Brake pad worn below minimum",
  //       "severity": "major"   -- "minor" | "major"
  //     }
  //   ]
  // ─────────────────────────────────────────────
  await knex.schema.createTable('dvir_reports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('driver_id').notNullable()
      .references('id').inTable('drivers').onDelete('RESTRICT');

    t.uuid('vehicle_id').notNullable()
      .references('id').inTable('vehicles').onDelete('RESTRICT');

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    t.uuid('session_id')
      .references('id').inTable('duty_sessions').onDelete('SET NULL');

    // pre = before trip, post = after trip, roadside = DOT inspection
    t.enu('report_type', ['pre', 'post', 'roadside']).notNullable();

    // Location at time of inspection
    t.decimal('latitude', 9, 6);
    t.decimal('longitude', 9, 6);
    t.string('location_description', 200);

    // Odometer at time of inspection
    t.decimal('odometer', 10, 1);

    // List of trailer numbers inspected (JSON array)
    t.jsonb('trailer_numbers').defaultTo('[]');

    // Defects found (see JSON structure above)
    t.jsonb('defects').notNullable().defaultTo('[]');
    t.boolean('defects_found').notNullable().defaultTo(false);

    // Safe to operate despite defects?
    t.boolean('safe_to_operate').notNullable().defaultTo(true);

    // Driver signature (base64 PNG of signature canvas)
    t.text('driver_signature');
    t.timestamp('driver_signed_at');

    // Mechanic review (required when defects_found = true)
    t.text('mechanic_signature');
    t.timestamp('mechanic_reviewed_at');
    t.text('mechanic_notes');
    t.enu('mechanic_decision', ['repaired', 'not_needed', 'deferred']).nullable();

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // DVIR reports are not edited after creation; updated_at not needed
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    -- GPS breadcrumbs: primary query is vehicle + time range
    CREATE INDEX idx_gps_vehicle_time
      ON gps_breadcrumbs(vehicle_id, recorded_at DESC);

    CREATE INDEX idx_gps_driver_time
      ON gps_breadcrumbs(driver_id, recorded_at DESC)
      WHERE driver_id IS NOT NULL;

    CREATE INDEX idx_gps_session
      ON gps_breadcrumbs(session_id)
      WHERE session_id IS NOT NULL;

    -- Violations: dispatcher alert panel queries by driver and unacknowledged
    CREATE INDEX idx_violations_driver
      ON violations(driver_id, occurred_at DESC);

    CREATE INDEX idx_violations_unacked
      ON violations(driver_id, acknowledged)
      WHERE acknowledged = FALSE;

    CREATE INDEX idx_violations_session
      ON violations(session_id);

    CREATE INDEX idx_violations_severity
      ON violations(severity, occurred_at DESC);

    -- DVIR: look up today's pre-trip or post-trip for a driver+vehicle
    CREATE INDEX idx_dvir_driver_vehicle
      ON dvir_reports(driver_id, vehicle_id, created_at DESC);

    CREATE INDEX idx_dvir_pending_mechanic
      ON dvir_reports(defects_found, mechanic_reviewed_at)
      WHERE defects_found = TRUE AND mechanic_reviewed_at IS NULL;
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('dvir_reports');
  await knex.schema.dropTableIfExists('violations');
  await knex.schema.dropTableIfExists('gps_breadcrumbs');
};
