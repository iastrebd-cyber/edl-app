'use strict';

/**
 * Migration 011 — Add jurisdiction_code to gps_breadcrumbs
 *
 * Tags each breadcrumb with the 2-letter jurisdiction it falls in,
 * so quarterly IFTA miles can be aggregated by state without re-geocoding.
 * Nullable: backfilled out of band; new breadcrumbs get the code when
 * the IFTA calculator runs.
 */

exports.up = async (knex) => {
  await knex.schema.alterTable('gps_breadcrumbs', (t) => {
    t.string('jurisdiction_code', 2)
      .references('code').inTable('jurisdictions').onDelete('RESTRICT');
  });

  await knex.schema.raw(`
    CREATE INDEX idx_gps_jurisdiction_recorded
      ON gps_breadcrumbs(jurisdiction_code, recorded_at DESC)
      WHERE jurisdiction_code IS NOT NULL;
  `);
};

exports.down = async (knex) => {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_gps_jurisdiction_recorded;');
  await knex.schema.alterTable('gps_breadcrumbs', (t) => {
    t.dropColumn('jurisdiction_code');
  });
};
