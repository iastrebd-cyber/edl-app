'use strict';

/**
 * Migration 008 — ELD Transfer Log
 *
 * Depends on: 007, 003 (drivers), 001 (carriers)
 *
 * eld_transfers — records every data transfer made to a DOT inspector.
 *
 * FMCSA §395.26(g) requires that every data transfer be logged.
 * The transfer log is itself part of the ELD output file.
 *
 * Transfer methods:
 *   'telematics' — HTTPS POST to FMCSA portal (eld.fmcsa.dot.gov)
 *   'bluetooth'  — local BT to inspector's device
 *   'usb'        — local USB transfer
 *   'display'    — driver displayed log on screen (no file transfer)
 */

exports.up = async (knex) => {

  await knex.schema.createTable('eld_transfers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('driver_id').notNullable()
      .references('id').inTable('drivers').onDelete('RESTRICT');

    t.uuid('carrier_id').notNullable()
      .references('id').inTable('carriers').onDelete('RESTRICT');

    // Transfer details
    t.enu('method', ['telematics', 'bluetooth', 'usb', 'display'])
      .notNullable();

    // Date range of data transferred (always 8 days back + current day)
    t.date('data_from_date').notNullable();
    t.date('data_to_date').notNullable();

    // Output file details
    t.string('output_filename', 200);
    t.string('file_checksum', 64);   // SHA-256 of the generated file

    // FMCSA telematics submission response
    t.string('fmcsa_submission_id', 100);   // returned by FMCSA portal
    t.enu('transfer_status', ['success', 'failed', 'pending'])
      .notNullable()
      .defaultTo('pending');
    t.text('transfer_error');

    // Inspector info (entered by driver at time of transfer)
    t.string('inspector_id', 50);          // DOT officer badge number (optional)
    t.string('inspection_report_number', 50);

    // Confirmation code shown to driver after successful telematics transfer
    t.string('confirmation_code', 20);

    // Comment added by driver before transfer (optional per spec)
    t.string('driver_comment', 60);

    t.timestamp('transferred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // Append-only: no updated_at
  });

  // ─────────────────────────────────────────────
  // INDEXES
  // ─────────────────────────────────────────────
  await knex.schema.raw(`
    CREATE INDEX idx_eld_transfers_driver
      ON eld_transfers(driver_id, transferred_at DESC);

    CREATE INDEX idx_eld_transfers_carrier
      ON eld_transfers(carrier_id, transferred_at DESC);
  `);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('eld_transfers');
};
