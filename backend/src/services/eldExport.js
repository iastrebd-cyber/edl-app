/**
 * backend/services/eldExport.js
 *
 * Builds an FMCSA-compliant ELD output file (plain-text CSV format).
 * Reference: FMCSA ELD Technical Spec §4.10.1 — Data Transfer File Format
 *
 * The file consists of:
 *   Section 1: Header record
 *   Section 2: ELD Event records  (one per duty-status change)
 *   Section 3: DVIR records
 *   Section 4: Unidentified driving records
 *   Section 5: Certification records
 *
 * Each record is pipe-delimited (|) and terminated with CRLF.
 * File ends with a SHA-256 hash of all preceding bytes.
 */

const crypto = require('crypto');

/**
 * @param {object} opts
 * @param {object} opts.driver       — driver record from DB/auth
 * @param {string} opts.session_id   — ELD session / trip ID (optional)
 * @param {string} opts.date_from    — YYYY-MM-DD
 * @param {string} opts.date_to      — YYYY-MM-DD
 * @param {string} [opts.output_code] — inspector output file code (4 chars)
 * @param {string} [opts.comment]
 * @returns {Promise<Buffer>}
 */
async function buildELDOutputFile(opts) {
  const { driver, session_id, date_from, date_to, output_code, comment } = opts;

  /* --- TODO: fetch real records from DB --------------------------------
   * const events = await db('eld_events')
   *   .where('driver_id', driver.id)
   *   .whereBetween('event_date', [date_from, date_to])
   *   .orderBy('event_time', 'asc');
   *
   * const dvirs = await db('dvir_reports')
   *   .where('driver_id', driver.id)
   *   .whereBetween('inspection_date', [date_from, date_to]);
   * ------------------------------------------------------------------*/

  // Stub data — replace with real DB queries above
  const events = [];
  const dvirs  = [];

  const lines = [];

  /* ── Section 1: File Header ── */
  lines.push([
    'FMCSA ELD',                          // File identifier
    '1.0',                                 // ELD spec version
    driver.id        || 'UNKNOWN',         // Driver ID
    driver.name      || '',                // Driver name
    driver.cdl       || '',                // CDL number
    driver.cdl_state || '',                // CDL state
    driver.carrier   || '',                // Carrier name
    driver.dot_number|| '',                // USDOT number
    driver.eld_id    || 'ELD001',          // ELD device identifier
    driver.vehicle   || '',                // Vehicle / CMV ID
    date_from,
    date_to,
    output_code      || '',
    comment          || '',
    new Date().toISOString(),              // File creation timestamp
  ].join('|'));

  /* ── Section 2: ELD Event Records ── */
  for (const ev of events) {
    lines.push([
      'EV',
      ev.event_type      || '1',           // 1=Duty status, 2=Int. coords, etc.
      ev.event_code      || '1',           // Status: 1=OFF, 2=SB, 3=D, 4=ON
      ev.event_date      || '',
      ev.event_time      || '',
      ev.latitude        || '0.0000',
      ev.longitude       || '0.0000',
      ev.odometer        || '0',
      ev.engine_hours    || '0.0',
      ev.order_number    || '',
      ev.trailer_number  || '',
      ev.shipping_doc    || '',
      ev.annotation      || '',
    ].join('|'));
  }

  /* ── Section 3: DVIR Records ── */
  for (const d of dvirs) {
    lines.push([
      'DVIR',
      d.inspection_date  || '',
      d.vehicle_id       || '',
      d.defects_found ? '1' : '0',
      d.defects_text     || '',
      d.mechanic_sig     || '',
      d.driver_sig       || '',
    ].join('|'));
  }

  /* ── Section 4: Unidentified Driving (placeholder) ── */
  // lines.push('UD|...');

  /* ── Section 5: Certification ── */
  lines.push([
    'CERT',
    driver.id   || '',
    driver.name || '',
    new Date().toISOString(),
    '1',  // certified = true
  ].join('|'));

  /* ── Assemble file ── */
  const body    = lines.join('\r\n') + '\r\n';
  const hash    = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  const full    = body + 'HASH|' + hash + '\r\n';

  return Buffer.from(full, 'utf8');
}

module.exports = { buildELDOutputFile };
