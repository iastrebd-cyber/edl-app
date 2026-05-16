'use strict';

/**
 * Migration 002 — Users + Vehicles
 *
 * Depends on: 001 (carriers, eld_devices)
 *
 * users    — all authenticated accounts (drivers, dispatchers, admins, DOT officers)
 * vehicles — CMV (commercial motor vehicles) registered to a carrier
 *
 * NOTE: vehicles references eld_devices but it's nullable — a vehicle
 *       can exist before an ELD is physically installed.
 */

exports.up = async (knex) => {

  // ─────────────────────────────────────────────
  // TABLE: users
  // Single users table for all roles.
  // Role determines what each user can see/do.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();

    // Role-based access control
    t.enu('role', ['driver', 'dispatcher', 'admin', 'dot_officer'])
      .notNullable()
      .defaultTo('driver');

    // Profile
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.string('phone', 30);

    // CDL (Commercial Driver's License) — required for drivers
    t.string('license_number', 50);
    t.string('license_state', 5);           // 2-char state code, e.g. 'TX'
    t.string('license_country', 5).defaultTo('US');  // 'US' or 'CA'
    t.date('license_expiry');

    // Locale preferences
    t.string('timezone', 60).notNullable().defaultTo('America/Chicago');
    t.enu('language', ['en', 'ru', 'es']).notNullable().defaultTo('en');

    // Which carrier this user belongs to (null for dot_officer)
    t.uuid('carrier_id')
      .references('id').inTable('carriers').onDelete('SET NULL');

    // Auth
    t.string('refresh_token_hash', 255);
    t.timestamp('refresh_token_expires_at');
    t.timestamp('last_login_at');
    t.integer('failed_login_attempts').notNullable().defaultTo(0);
    t.timestamp('locked_until');

    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('email_verified').notNullable().defaultTo(false);
    t.string('email_verification_token', 100);

    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // TABLE: vehicles
  // CMV registered to a carrier.
  // Links to eld_device (nullable until hardware installed).
  // ─────────────────────────────────────────────
  await knex.schema.createTable('vehicles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    // ELD device attached to this vehicle (nullable)
    t.uuid('eld_device_id')
      .references('id').inTable('eld_devices').onDelete('SET NULL');

    // VIN is the primary CMV identifier for FMCSA
    t.string('vin', 17).notNullable().unique();
    t.string('plate_number', 20).notNullable();
    t.string('plate_state', 5).notNullable();   // 2-char state/province

    // Vehicle details
    t.string('make', 60);            // e.g. 'Peterbilt'
    t.string('model', 60);           // e.g. '579'
    t.smallint('year');
    t.enu('fuel_type', ['diesel', 'gasoline', 'electric', 'lng', 'cng'])
      .defaultTo('diesel');

    // CMV classification (affects HOS rules)
    t.enu('vehicle_type', ['truck', 'bus', 'combination'])
      .notNullable()
      .defaultTo('truck');

    // Running totals updated from ECM on each session
    t.decimal('current_odometer', 10, 1).defaultTo(0);     // total miles
    t.decimal('current_engine_hours', 8, 2).defaultTo(0);  // total engine hours

    // Trailers (JSON array of trailer numbers currently attached)
    t.jsonb('current_trailers').defaultTo('[]');

    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    CREATE INDEX idx_users_carrier   ON users(carrier_id);
    CREATE INDEX idx_users_role      ON users(role);
    CREATE INDEX idx_users_email     ON users(email);
    CREATE INDEX idx_vehicles_carrier   ON vehicles(carrier_id);
    CREATE INDEX idx_vehicles_vin       ON vehicles(vin);
    CREATE INDEX idx_vehicles_eld       ON vehicles(eld_device_id);
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('vehicles');
  await knex.schema.dropTableIfExists('users');
};
