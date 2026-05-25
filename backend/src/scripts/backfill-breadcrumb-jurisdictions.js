'use strict';

/**
 * src/scripts/backfill-breadcrumb-jurisdictions.js
 *
 * One-shot script: scans gps_breadcrumbs rows where jurisdiction_code IS NULL
 * and fills it in using the reverse geocoder. Run after migration 011 to
 * tag historical data.
 *
 * Usage:
 *   node src/scripts/backfill-breadcrumb-jurisdictions.js
 *
 * Idempotent: re-running only touches rows that are still NULL.
 */

require('dotenv').config();

const db = require('../config/db');
const { geocode } = require('../services/ifta/reverse-geocoder.service');

const BATCH_SIZE = 5000;

async function run() {
  console.log('[backfill] starting...');

  const [{ count: pendingStr }] = await db('gps_breadcrumbs')
    .whereNull('jurisdiction_code')
    .count('id as count');
  const pending = parseInt(pendingStr, 10);
  console.log(`[backfill] ${pending} breadcrumbs need jurisdiction_code`);

  if (pending === 0) {
    await db.destroy();
    return;
  }

  let processed = 0;
  let assigned  = 0;
  let nullified = 0;
  const startTime = Date.now();

  while (true) {
    const rows = await db('gps_breadcrumbs')
      .select('id', 'latitude', 'longitude')
      .whereNull('jurisdiction_code')
      .orderBy('id', 'asc')
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;

    const updatesByCode = new Map();

    for (const row of rows) {
      const code = geocode(parseFloat(row.latitude), parseFloat(row.longitude));
      if (code) {
        if (!updatesByCode.has(code)) updatesByCode.set(code, []);
        updatesByCode.get(code).push(row.id);
        assigned++;
      } else {
        nullified++;
      }
    }

    for (const [code, ids] of updatesByCode.entries()) {
      for (let i = 0; i < ids.length; i += 500) {
        await db('gps_breadcrumbs')
          .whereIn('id', ids.slice(i, i + 500))
          .update({ jurisdiction_code: code });
      }
    }

    processed += rows.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processed / Math.max(parseFloat(elapsed), 0.1)).toFixed(0);
    console.log(`[backfill] processed ${processed} (assigned: ${assigned}, outside US: ${nullified}) — ${rate} rows/sec`);

    // If this whole batch resolved to nothing AND we're scanning the same NULL
    // rows again next iteration, we'd loop forever. Bail out.
    if (updatesByCode.size === 0) {
      console.log('[backfill] no further assignments possible — remaining rows are all outside US bounds');
      break;
    }
  }

  console.log(`[backfill] DONE. Total processed: ${processed}, assigned: ${assigned}, outside US: ${nullified}`);
  await db.destroy();
}

run().catch(err => {
  console.error('[backfill] FAILED:', err);
  process.exit(1);
});
