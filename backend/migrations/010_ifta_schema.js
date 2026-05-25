'use strict';

/**
 * Migration 010 — IFTA (International Fuel Tax Agreement) schema, US-only MVP
 *
 * Depends on: 001 (carriers, eld_devices), 002 (vehicles, users), 003 (drivers)
 *
 * Adds:
 *   jurisdictions             — reference table of US states + DC with fuel tax rates
 *   ifta_fuel_purchases       — per-purchase fuel receipts
 *   ifta_jurisdiction_miles   — per-vehicle per-quarter mileage by jurisdiction
 *   ifta_quarterly_reports    — generated quarterly IFTA filings
 *
 * Also extends carriers with:
 *   ifta_account_number       — carrier's IFTA license number
 *   ifta_base_jurisdiction    — state of IFTA registration (FK to jurisdictions.code)
 *
 * Fuel tax rates are placeholders for Q1 2026. Rates change quarterly via
 * iftach.org — operator is expected to refresh them out of band.
 */

exports.up = async (knex) => {

  // ─────────────────────────────────────────────
  // TABLE: jurisdictions
  // Reference table of taxing jurisdictions. PK is the 2-letter postal code so
  // FK joins from fuel purchases, mileage rows, and carrier base read naturally.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('jurisdictions', (t) => {
    t.string('code', 2).primary();
    t.string('name', 60).notNullable();
    t.enu('country', ['US', 'CA']).notNullable().defaultTo('US');
    t.boolean('is_ifta_member').notNullable().defaultTo(true);

    // $/gallon, diesel — placeholder rates
    t.decimal('fuel_tax_rate', 6, 4).notNullable().defaultTo(0);
    t.date('rate_effective_from').notNullable();

    // IN/KY/VA charge a surcharge in addition to the base fuel tax
    t.decimal('surcharge_rate', 6, 4).notNullable().defaultTo(0);

    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // SEED: 50 US states + DC (51 rows)
  //
  // Rates are placeholders for Q1 2026. Non-IFTA-member states (AK, HI, OR)
  // are still listed for completeness — carriers may purchase fuel there even
  // though it doesn't count toward IFTA filing.
  // ─────────────────────────────────────────────
  const RATE_EFFECTIVE_FROM = '2026-01-01';

  const US_JURISDICTIONS = [
    { code: 'AL', name: 'Alabama',              is_ifta_member: true,  fuel_tax_rate: 0.2900, surcharge_rate: 0.0000 },
    { code: 'AK', name: 'Alaska',               is_ifta_member: false, fuel_tax_rate: 0.0800, surcharge_rate: 0.0000 },
    { code: 'AZ', name: 'Arizona',              is_ifta_member: true,  fuel_tax_rate: 0.2600, surcharge_rate: 0.0000 },
    { code: 'AR', name: 'Arkansas',             is_ifta_member: true,  fuel_tax_rate: 0.2850, surcharge_rate: 0.0000 },
    { code: 'CA', name: 'California',           is_ifta_member: true,  fuel_tax_rate: 0.9050, surcharge_rate: 0.0000 },
    { code: 'CO', name: 'Colorado',             is_ifta_member: true,  fuel_tax_rate: 0.2050, surcharge_rate: 0.0000 },
    { code: 'CT', name: 'Connecticut',          is_ifta_member: true,  fuel_tax_rate: 0.4920, surcharge_rate: 0.0000 },
    { code: 'DE', name: 'Delaware',             is_ifta_member: true,  fuel_tax_rate: 0.2200, surcharge_rate: 0.0000 },
    { code: 'DC', name: 'District of Columbia', is_ifta_member: true,  fuel_tax_rate: 0.2350, surcharge_rate: 0.0000 },
    { code: 'FL', name: 'Florida',              is_ifta_member: true,  fuel_tax_rate: 0.3641, surcharge_rate: 0.0000 },
    { code: 'GA', name: 'Georgia',              is_ifta_member: true,  fuel_tax_rate: 0.3210, surcharge_rate: 0.0000 },
    { code: 'HI', name: 'Hawaii',               is_ifta_member: false, fuel_tax_rate: 0.1700, surcharge_rate: 0.0000 },
    { code: 'ID', name: 'Idaho',                is_ifta_member: true,  fuel_tax_rate: 0.3200, surcharge_rate: 0.0000 },
    { code: 'IL', name: 'Illinois',             is_ifta_member: true,  fuel_tax_rate: 0.4670, surcharge_rate: 0.0000 },
    { code: 'IN', name: 'Indiana',              is_ifta_member: true,  fuel_tax_rate: 0.5700, surcharge_rate: 0.1100 },
    { code: 'IA', name: 'Iowa',                 is_ifta_member: true,  fuel_tax_rate: 0.3250, surcharge_rate: 0.0000 },
    { code: 'KS', name: 'Kansas',               is_ifta_member: true,  fuel_tax_rate: 0.2600, surcharge_rate: 0.0000 },
    { code: 'KY', name: 'Kentucky',             is_ifta_member: true,  fuel_tax_rate: 0.2160, surcharge_rate: 0.0440 },
    { code: 'LA', name: 'Louisiana',            is_ifta_member: true,  fuel_tax_rate: 0.2000, surcharge_rate: 0.0000 },
    { code: 'ME', name: 'Maine',                is_ifta_member: true,  fuel_tax_rate: 0.3120, surcharge_rate: 0.0000 },
    { code: 'MD', name: 'Maryland',             is_ifta_member: true,  fuel_tax_rate: 0.4275, surcharge_rate: 0.0000 },
    { code: 'MA', name: 'Massachusetts',        is_ifta_member: true,  fuel_tax_rate: 0.2400, surcharge_rate: 0.0000 },
    { code: 'MI', name: 'Michigan',             is_ifta_member: true,  fuel_tax_rate: 0.4470, surcharge_rate: 0.0000 },
    { code: 'MN', name: 'Minnesota',            is_ifta_member: true,  fuel_tax_rate: 0.2850, surcharge_rate: 0.0000 },
    { code: 'MS', name: 'Mississippi',          is_ifta_member: true,  fuel_tax_rate: 0.1840, surcharge_rate: 0.0000 },
    { code: 'MO', name: 'Missouri',             is_ifta_member: true,  fuel_tax_rate: 0.2700, surcharge_rate: 0.0000 },
    { code: 'MT', name: 'Montana',              is_ifta_member: true,  fuel_tax_rate: 0.2975, surcharge_rate: 0.0000 },
    { code: 'NE', name: 'Nebraska',             is_ifta_member: true,  fuel_tax_rate: 0.2940, surcharge_rate: 0.0000 },
    { code: 'NV', name: 'Nevada',               is_ifta_member: true,  fuel_tax_rate: 0.2700, surcharge_rate: 0.0000 },
    { code: 'NH', name: 'New Hampshire',        is_ifta_member: true,  fuel_tax_rate: 0.2360, surcharge_rate: 0.0000 },
    { code: 'NJ', name: 'New Jersey',           is_ifta_member: true,  fuel_tax_rate: 0.4940, surcharge_rate: 0.0000 },
    { code: 'NM', name: 'New Mexico',           is_ifta_member: true,  fuel_tax_rate: 0.2100, surcharge_rate: 0.0000 },
    { code: 'NY', name: 'New York',             is_ifta_member: true,  fuel_tax_rate: 0.4485, surcharge_rate: 0.0000 },
    { code: 'NC', name: 'North Carolina',       is_ifta_member: true,  fuel_tax_rate: 0.4050, surcharge_rate: 0.0000 },
    { code: 'ND', name: 'North Dakota',         is_ifta_member: true,  fuel_tax_rate: 0.2300, surcharge_rate: 0.0000 },
    { code: 'OH', name: 'Ohio',                 is_ifta_member: true,  fuel_tax_rate: 0.4700, surcharge_rate: 0.0000 },
    { code: 'OK', name: 'Oklahoma',             is_ifta_member: true,  fuel_tax_rate: 0.2000, surcharge_rate: 0.0000 },
    { code: 'OR', name: 'Oregon',               is_ifta_member: false, fuel_tax_rate: 0.4000, surcharge_rate: 0.0000 },
    { code: 'PA', name: 'Pennsylvania',         is_ifta_member: true,  fuel_tax_rate: 0.7410, surcharge_rate: 0.0000 },
    { code: 'RI', name: 'Rhode Island',         is_ifta_member: true,  fuel_tax_rate: 0.3700, surcharge_rate: 0.0000 },
    { code: 'SC', name: 'South Carolina',       is_ifta_member: true,  fuel_tax_rate: 0.2800, surcharge_rate: 0.0000 },
    { code: 'SD', name: 'South Dakota',         is_ifta_member: true,  fuel_tax_rate: 0.2800, surcharge_rate: 0.0000 },
    { code: 'TN', name: 'Tennessee',            is_ifta_member: true,  fuel_tax_rate: 0.2700, surcharge_rate: 0.0000 },
    { code: 'TX', name: 'Texas',                is_ifta_member: true,  fuel_tax_rate: 0.2000, surcharge_rate: 0.0000 },
    { code: 'UT', name: 'Utah',                 is_ifta_member: true,  fuel_tax_rate: 0.3650, surcharge_rate: 0.0000 },
    { code: 'VT', name: 'Vermont',              is_ifta_member: true,  fuel_tax_rate: 0.3400, surcharge_rate: 0.0000 },
    { code: 'VA', name: 'Virginia',             is_ifta_member: true,  fuel_tax_rate: 0.2710, surcharge_rate: 0.0890 },
    { code: 'WA', name: 'Washington',           is_ifta_member: true,  fuel_tax_rate: 0.4940, surcharge_rate: 0.0000 },
    { code: 'WV', name: 'West Virginia',        is_ifta_member: true,  fuel_tax_rate: 0.3570, surcharge_rate: 0.0000 },
    { code: 'WI', name: 'Wisconsin',            is_ifta_member: true,  fuel_tax_rate: 0.3290, surcharge_rate: 0.0000 },
    { code: 'WY', name: 'Wyoming',              is_ifta_member: true,  fuel_tax_rate: 0.2400, surcharge_rate: 0.0000 },
  ];

  await knex('jurisdictions').insert(
    US_JURISDICTIONS.map(j => ({
      ...j,
      country:             'US',
      rate_effective_from: RATE_EFFECTIVE_FROM,
    }))
  );

  // ─────────────────────────────────────────────
  // TABLE: ifta_fuel_purchases
  // Per-purchase fuel receipts. Drives taxable_gallons in quarterly reports.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('ifta_fuel_purchases', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');
    t.uuid('vehicle_id').notNullable()
      .references('id').inTable('vehicles').onDelete('RESTRICT');
    t.uuid('driver_id')
      .references('id').inTable('drivers').onDelete('SET NULL');

    t.timestamp('purchase_date', { useTz: true }).notNullable();
    t.string('jurisdiction_code', 2).notNullable()
      .references('code').inTable('jurisdictions').onDelete('RESTRICT');

    t.string('station_name', 200);
    t.string('station_address', 300);

    t.decimal('gallons', 8, 3).notNullable();
    t.decimal('price_per_gallon', 6, 3);
    t.decimal('total_amount', 10, 2);
    t.enu('fuel_type', ['diesel', 'gasoline', 'propane', 'cng', 'lng', 'electric'])
      .notNullable().defaultTo('diesel');

    t.decimal('odometer', 10, 1);

    t.string('receipt_url', 500);
    t.text('notes');

    t.uuid('created_by_user_id')
      .references('id').inTable('users').onDelete('SET NULL');

    t.timestamps(true, true);
  });

  // ─────────────────────────────────────────────
  // TABLE: ifta_jurisdiction_miles
  // Per-vehicle, per-quarter mileage broken out by jurisdiction.
  // Computed from gps_breadcrumbs in step 2.
  // ─────────────────────────────────────────────
  await knex.schema.createTable('ifta_jurisdiction_miles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('CASCADE');
    t.uuid('vehicle_id').notNullable()
      .references('id').inTable('vehicles').onDelete('CASCADE');
    t.string('jurisdiction_code', 2).notNullable()
      .references('code').inTable('jurisdictions').onDelete('RESTRICT');

    t.smallint('year').notNullable();
    t.smallint('quarter').notNullable();

    t.decimal('total_miles', 10, 2).notNullable().defaultTo(0);
    t.decimal('taxable_miles', 10, 2).notNullable().defaultTo(0);

    t.enu('calculation_method', ['gps', 'manual', 'estimated'])
      .notNullable().defaultTo('gps');
    t.integer('breadcrumbs_count').defaultTo(0);
    t.timestamp('calculated_at', { useTz: true });

    t.timestamps(true, true);

    t.unique(['carrier_id', 'vehicle_id', 'jurisdiction_code', 'year', 'quarter']);
  });

  // ─────────────────────────────────────────────
  // TABLE: ifta_quarterly_reports
  // Generated quarterly filing per carrier. Aggregates miles + gallons across
  // all vehicles for the period. jurisdiction_breakdown JSON shape:
  //   [{ jurisdiction, miles, taxable_gallons, tax_paid_at_pump, tax_owed, net_tax }]
  // ─────────────────────────────────────────────
  await knex.schema.createTable('ifta_quarterly_reports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    t.smallint('year').notNullable();
    t.smallint('quarter').notNullable();

    t.decimal('total_miles_all_jurisdictions', 12, 2).defaultTo(0);
    t.decimal('total_taxable_gallons',         10, 3).defaultTo(0);
    t.decimal('total_tax_paid',                10, 2).defaultTo(0);

    t.jsonb('jurisdiction_breakdown').notNullable().defaultTo('[]');

    t.enu('status', ['draft', 'finalized', 'filed', 'amended'])
      .notNullable().defaultTo('draft');

    t.timestamp('generated_at', { useTz: true });
    t.timestamp('finalized_at', { useTz: true });
    t.timestamp('filed_at',     { useTz: true });
    t.string('filed_confirmation_number', 100);

    t.uuid('created_by_user_id')
      .references('id').inTable('users').onDelete('SET NULL');

    t.timestamps(true, true);

    t.unique(['carrier_id', 'year', 'quarter']);
  });

  // ─────────────────────────────────────────────
  // ALTER: carriers — add IFTA registration columns
  // ─────────────────────────────────────────────
  await knex.schema.alterTable('carriers', (t) => {
    t.string('ifta_account_number', 50);
    t.string('ifta_base_jurisdiction', 2)
      .references('code').inTable('jurisdictions').onDelete('SET NULL');
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    CREATE INDEX idx_ifta_fuel_carrier_date      ON ifta_fuel_purchases(carrier_id, purchase_date DESC);
    CREATE INDEX idx_ifta_fuel_vehicle_date      ON ifta_fuel_purchases(vehicle_id, purchase_date DESC);
    CREATE INDEX idx_ifta_fuel_jurisdiction      ON ifta_fuel_purchases(jurisdiction_code, purchase_date DESC);

    CREATE INDEX idx_ifta_miles_carrier_period   ON ifta_jurisdiction_miles(carrier_id, year, quarter);
    CREATE INDEX idx_ifta_miles_vehicle_period   ON ifta_jurisdiction_miles(vehicle_id, year, quarter);

    CREATE INDEX idx_ifta_reports_carrier_period ON ifta_quarterly_reports(carrier_id, year DESC, quarter DESC);
    CREATE INDEX idx_ifta_reports_status         ON ifta_quarterly_reports(carrier_id, status);
  `);
};

exports.down = async (knex) => {
  // Reverse order: drop carriers FK first, then dependent tables, then jurisdictions.
  await knex.schema.alterTable('carriers', (t) => {
    t.dropColumn('ifta_base_jurisdiction');
  });
  await knex.schema.alterTable('carriers', (t) => {
    t.dropColumn('ifta_account_number');
  });

  await knex.schema.dropTableIfExists('ifta_quarterly_reports');
  await knex.schema.dropTableIfExists('ifta_jurisdiction_miles');
  await knex.schema.dropTableIfExists('ifta_fuel_purchases');
  await knex.schema.dropTableIfExists('jurisdictions');
};
