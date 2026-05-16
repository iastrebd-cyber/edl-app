'use strict';

/**
 * Migration 003 — Drivers
 *
 * Depends on: 002 (users, vehicles), 001 (carriers)
 *
 * drivers — extends the users table for driver-specific fields.
 *
 * Why a separate table (not just fields on users)?
 *   - Dispatchers and admins don't need HOS cycle, ELD exemptions, co-driver links.
 *   - Keeps the users table clean and join-able without irrelevant NULLs.
 *   - FMCSA treats "driver" as a distinct regulated entity with its own requirements.
 *
 * Self-referential FK: co_driver_id → drivers(id)
 *   Allows team driving (sleeper berth pairs), resolved after both rows exist.
 */

exports.up = async (knex) => {

  await knex.schema.createTable('drivers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // 1:1 link to users
    t.uuid('user_id').notNullable().unique()
      .references('id').inTable('users').onDelete('CASCADE');

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    // Co-driver (team driving / sleeper berth partner)
    // Nullable, self-referential — set after both driver rows exist
    t.uuid('co_driver_id')
      .references('id').inTable('drivers').onDelete('SET NULL');

    // ── HOS Rule Configuration ──────────────────────────────────────────
    // Which cycle applies to this driver (carrier default, overridable)
    t.enu('hos_cycle', ['usa_60', 'usa_70', 'canada_70', 'canada_120'])
      .notNullable()
      .defaultTo('usa_70');

    // FMCSA exemptions
    t.boolean('exempt_from_eld').notNullable().defaultTo(false);
    // § 395.1(e)(1) — Short-Haul: ≤150 air miles, no ELD required
    t.boolean('short_haul_exception').notNullable().defaultTo(false);
    // § 395.1(b) — Agricultural operations exception
    t.boolean('agricultural_exception').notNullable().defaultTo(false);

    // Jurisdiction (US or CA or both — determines which export to generate)
    t.boolean('operates_in_canada').notNullable().defaultTo(false);
    // Canadian deferral rule: driver can defer up to 2h driving to the next day
    t.boolean('canada_deferral_enabled').notNullable().defaultTo(false);

    // ── Current Live Status ─────────────────────────────────────────────
    // Denormalized for fast fleet-map queries without joining hos_events
    t.enu('current_status', ['OFF', 'SB', 'D', 'ON'])
      .notNullable()
      .defaultTo('OFF');
    t.timestamp('status_changed_at');

    // Which vehicle the driver is currently operating (nullable when off duty)
    t.uuid('current_vehicle_id')
      .references('id').inTable('vehicles').onDelete('SET NULL');

    // Current GPS position (denormalized from last GPS ping — for fleet map)
    t.decimal('current_latitude', 9, 6);
    t.decimal('current_longitude', 9, 6);
    t.timestamp('position_updated_at');

    // ── Certifications ──────────────────────────────────────────────────
    // HAZMAT endorsement (affects load eligibility)
    t.boolean('hazmat_endorsement').notNullable().defaultTo(false);
    // Passenger endorsement
    t.boolean('passenger_endorsement').notNullable().defaultTo(false);

    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    CREATE INDEX idx_drivers_user_id        ON drivers(user_id);
    CREATE INDEX idx_drivers_carrier        ON drivers(carrier_id);
    CREATE INDEX idx_drivers_current_status ON drivers(current_status);
    CREATE INDEX idx_drivers_vehicle        ON drivers(current_vehicle_id);
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('drivers');
};
