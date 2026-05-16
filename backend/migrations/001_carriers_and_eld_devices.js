'use strict';

/**
 * Migration 001 — Carriers + ELD devices
 *
 * Created first because:
 *   - carriers has no FK dependencies
 *   - eld_devices has no FK dependencies
 *   - vehicles, drivers, and users all reference these tables
 *
 * carriers   — USDOT-registered motor carriers (перевозчики)
 * eld_devices — physical ELD hardware units registered to a carrier
 */

exports.up = async (knex) => {

  // ─────────────────────────────────────────────
  // TABLE: carriers
  // One row per USDOT-registered motor carrier.
  // All drivers, vehicles, and sessions belong to a carrier.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('carriers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // FMCSA identifiers
    t.string('name', 200).notNullable();
    t.string('usdot_number', 20).notNullable().unique();  // US DOT number
    t.string('mc_number', 20).unique();                   // Motor Carrier number (optional for private)
    t.string('canadian_nsc', 30).unique();                // National Safety Code (Canada)

    // Contact
    t.string('main_office_address', 300);
    t.string('phone', 30);
    t.string('email', 200);

    // Timezone used for 34h restart calculation (FMCSA requires home terminal TZ)
    t.string('home_terminal_timezone', 60)
      .notNullable()
      .defaultTo('America/Chicago');

    // Carrier-level HOS rule defaults (can be overridden per driver)
    t.enu('default_hos_cycle', ['usa_60', 'usa_70', 'canada_70', 'canada_120'])
      .notNullable()
      .defaultTo('usa_70');

    // Whether this carrier operates in Canada (enables Canadian ELD export)
    t.boolean('operates_in_canada').notNullable().defaultTo(false);

    // FMCSA ELD registration — the carrier registers the ELD provider
    t.string('eld_provider_name', 100);
    t.string('eld_registration_id', 50);  // from fmcsa.dot.gov

    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);  // created_at, updated_at
  });

  // ─────────────────────────────────────────────
  // TABLE: eld_devices
  // Physical ELD hardware units (Samsara, KeepTruckin, etc.)
  // Each device is linked to a vehicle (set on vehicle row).
  // ─────────────────────────────────────────────
  await knex.schema.createTable('eld_devices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    // Device identification
    t.string('serial_number', 100).notNullable().unique();
    t.string('manufacturer', 100).notNullable();   // e.g. "Samsara"
    t.string('model', 100).notNullable();          // e.g. "VG54"
    t.string('firmware_version', 50);

    // FMCSA registration — the device must be certified & listed
    t.string('registration_id', 100);   // FMCSA device registration ID
    t.boolean('fmcsa_certified').notNullable().defaultTo(false);
    t.date('certified_at');

    // ECM connection method
    t.enu('connection_type', ['bluetooth', 'wifi', 'cellular', 'usb'])
      .notNullable()
      .defaultTo('bluetooth');

    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    CREATE INDEX idx_carriers_usdot ON carriers(usdot_number);
    CREATE INDEX idx_eld_devices_carrier ON eld_devices(carrier_id);
    CREATE INDEX idx_eld_devices_serial ON eld_devices(serial_number);
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('eld_devices');
  await knex.schema.dropTableIfExists('carriers');
};
