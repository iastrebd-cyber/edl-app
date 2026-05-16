'use strict';

/**
 * Migration 007 — Trips, Audit Log, Notifications
 *
 * Depends on: 006, 005, 004, 003, 002, 001
 *
 * trips         — freight loads assigned to drivers
 * audit_log     — immutable record of all data changes (FMCSA requirement)
 * notifications — push/SMS/email notifications sent to users
 */

exports.up = async (knex) => {

  // ─────────────────────────────────────────────
  // TABLE: trips
  //
  // A trip = one freight load from origin to destination.
  // Dispatchers create trips and assign them to drivers.
  // Drivers can see their assigned trips in the app.
  //
  // Not directly required by FMCSA ELD standard,
  // but shipping documents from trips populate duty_sessions.shipping_documents.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('trips', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    // Dispatcher who created this trip
    t.uuid('dispatcher_id')
      .references('id').inTable('users').onDelete('SET NULL');

    // Assigned driver (can be changed before trip starts)
    t.uuid('driver_id')
      .references('id').inTable('drivers').onDelete('SET NULL');

    // Assigned vehicle
    t.uuid('vehicle_id')
      .references('id').inTable('vehicles').onDelete('SET NULL');

    // Load details
    t.string('load_number', 50);            // internal or broker load number
    t.string('commodity', 200);             // what's being hauled
    t.decimal('weight_lbs', 10, 1);         // gross vehicle weight
    t.boolean('hazmat').notNullable().defaultTo(false);
    t.string('hazmat_class', 20);           // UN hazmat class if applicable

    // Shipper / Consignee
    t.string('shipper_name', 200);
    t.string('shipper_address', 300);
    t.string('consignee_name', 200);
    t.string('consignee_address', 300);

    // Routing
    t.string('origin_address', 300);
    t.string('destination_address', 300);
    t.decimal('estimated_miles', 8, 1);

    // Schedule
    t.timestamp('planned_departure', { useTz: true });
    t.timestamp('planned_arrival', { useTz: true });
    t.timestamp('actual_departure', { useTz: true });
    t.timestamp('actual_arrival', { useTz: true });

    // Trailer numbers (JSON array)
    t.jsonb('trailer_numbers').defaultTo('[]');

    // Status lifecycle
    t.enu('status', [
      'pending',        // created, not yet assigned
      'assigned',       // driver assigned, not started
      'in_progress',    // driver has departed
      'delivered',      // driver has arrived, load delivered
      'completed',      // POD confirmed, billing done
      'cancelled',
    ]).notNullable().defaultTo('pending');

    // Documents (JSON array of { type, url, name })
    // Types: 'bol', 'pod', 'rate_confirmation', 'lumper', 'other'
    t.jsonb('documents').defaultTo('[]');

    // HOS pre-check: was driver checked for available hours before assignment?
    t.boolean('hos_check_passed');
    t.decimal('hos_available_hours_at_assignment', 5, 2);

    // Notes
    t.text('dispatcher_notes');
    t.text('driver_notes');

    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // TABLE: audit_log
  //
  // Immutable record of every significant data change in the system.
  // Required by FMCSA §395.8(i) — "record of duty status changes must
  // be retained for a period of not less than 6 months".
  //
  // This table captures WHO changed WHAT and WHEN, for all tables.
  // Records are never deleted (use archival/partitioning after 6 months).
  // ─────────────────────────────────────────────
  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id').primary();

    // Who made the change
    t.uuid('user_id')
      .references('id').inTable('users').onDelete('SET NULL');

    // What changed
    t.string('table_name', 60).notNullable();   // 'hos_events', 'duty_sessions', etc.
    t.uuid('record_id');                          // UUID of the changed row
    t.enu('action', ['INSERT', 'UPDATE', 'DELETE']).notNullable();

    // Full snapshots of changed data
    t.jsonb('old_values');  // NULL for INSERT
    t.jsonb('new_values');  // NULL for DELETE

    // Request context
    t.string('ip_address', 45);          // IPv4 or IPv6
    t.string('user_agent', 300);
    t.string('request_id', 50);          // correlates with API logs

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // NO updated_at — append-only
  });

  // ─────────────────────────────────────────────
  // TABLE: notifications
  //
  // Queue of outbound notifications (push, SMS, email).
  // Processed by the notification worker service.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');

    t.enu('channel', ['push', 'sms', 'email', 'in_app'])
      .notNullable();

    t.enu('type', [
      'hos_warning',          // approaching HOS limit
      'hos_violation',        // HOS limit exceeded
      'dvir_defect',          // DVIR defect requires mechanic review
      'trip_assigned',        // dispatcher assigned a trip
      'trip_updated',         // trip details changed
      'malfunction_detected', // ELD malfunction detected
      'session_not_certified',// reminder to certify daily log
      'system',               // generic system message
    ]).notNullable();

    t.string('title', 200).notNullable();
    t.text('body').notNullable();

    // Deep link for mobile push (e.g. 'eld://violations/uuid')
    t.string('action_url', 500);

    // Related entities (for navigating from notification)
    t.uuid('related_violation_id')
      .references('id').inTable('violations').onDelete('SET NULL');
    t.uuid('related_trip_id')
      .references('id').inTable('trips').onDelete('SET NULL');
    t.uuid('related_session_id')
      .references('id').inTable('duty_sessions').onDelete('SET NULL');

    // Delivery status
    t.enu('status', ['pending', 'sent', 'failed', 'read'])
      .notNullable()
      .defaultTo('pending');

    t.timestamp('sent_at');
    t.timestamp('read_at');
    t.text('failure_reason');
    t.integer('retry_count').notNullable().defaultTo(0);

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    -- Trips: dispatcher queries by carrier+status, driver queries by driver_id
    CREATE INDEX idx_trips_carrier_status ON trips(carrier_id, status);
    CREATE INDEX idx_trips_driver         ON trips(driver_id, status);
    CREATE INDEX idx_trips_vehicle        ON trips(vehicle_id);
    CREATE INDEX idx_trips_departure      ON trips(planned_departure DESC);

    -- Audit log: lookup by table+record for history view
    CREATE INDEX idx_audit_table_record   ON audit_log(table_name, record_id);
    CREATE INDEX idx_audit_user           ON audit_log(user_id, created_at DESC);
    CREATE INDEX idx_audit_created        ON audit_log(created_at DESC);

    -- Notifications: driver polls pending notifications
    CREATE INDEX idx_notifications_user_pending
      ON notifications(user_id, status, created_at DESC)
      WHERE status IN ('pending', 'sent');
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('trips');
};
