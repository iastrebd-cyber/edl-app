'use strict';

/**
 * Migration 009 — Extend eld_transfers.method enum
 *
 * Adds 'email' and 'local' as valid transfer methods so that the
 * DOT Transfer API (which accepts method: https | email | local)
 * can write to the eld_transfers table without a CHECK violation.
 *
 * Knex uses a plain CHECK constraint (not a PostgreSQL ENUM type),
 * so extending it requires:
 *   1. Drop the existing eld_transfers_method_check constraint.
 *   2. Re-create it with the expanded set of allowed values.
 *
 * Method mapping used by the API:
 *   https  → stored as 'telematics'  (FMCSA eRODS portal)
 *   email  → stored as 'email'       (new — electronic to inspector)
 *   local  → stored as 'local'       (new — file download to device)
 */

const OLD_VALUES = ['telematics', 'bluetooth', 'usb', 'display'];
const NEW_VALUES = ['telematics', 'bluetooth', 'usb', 'display', 'email', 'local'];

exports.up = async (knex) => {
  await knex.schema.raw(`
    ALTER TABLE eld_transfers
      DROP CONSTRAINT IF EXISTS eld_transfers_method_check;

    ALTER TABLE eld_transfers
      ADD  CONSTRAINT eld_transfers_method_check
      CHECK (method IN (${NEW_VALUES.map(v => `'${v}'`).join(', ')}));
  `);
};

exports.down = async (knex) => {
  await knex.schema.raw(`
    ALTER TABLE eld_transfers
      DROP CONSTRAINT IF EXISTS eld_transfers_method_check;

    ALTER TABLE eld_transfers
      ADD  CONSTRAINT eld_transfers_method_check
      CHECK (method IN (${OLD_VALUES.map(v => `'${v}'`).join(', ')}));
  `);
};
