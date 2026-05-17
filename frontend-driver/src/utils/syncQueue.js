/**
 * src/utils/syncQueue.js
 *
 * Sync queue: flushes offline-queued HOS events to the server
 * when internet connection is restored.
 *
 * Flow:
 *   1. App detects online status (navigator.onLine or online event)
 *   2. syncQueue.flush() is called
 *   3. Fetches all pending events from IndexedDB
 *   4. Sends them to POST /api/hos-events in chronological order
 *   5. On success: moves event to synced cache
 *   6. On failure: marks as failed, will retry next time
 *
 * FMCSA requirement: events must be in chronological order.
 * The queue respects event_datetime, not local_id.
 */

import { hosAPI } from '../api/client';
import {
  getPendingEvents,
  markEventSynced,
  markEventFailed,
  getPendingCount,
} from './offlineDB';

let isSyncing = false;

/**
 * Flush all pending events to the server.
 * Safe to call multiple times — will skip if already running.
 *
 * @param {function} [onProgress] — callback(synced, total)
 * @returns {{ synced: number, failed: number }}
 */
export async function flush(onProgress) {
  if (isSyncing) {
    console.log('[sync] Already syncing, skipping');
    return { synced: 0, failed: 0 };
  }

  const pending = await getPendingEvents();
  if (pending.length === 0) {
    console.log('[sync] Nothing to sync');
    return { synced: 0, failed: 0 };
  }

  isSyncing = true;
  console.log(`[sync] Starting sync of ${pending.length} events`);

  // Sort by event_datetime to maintain chronological order (FMCSA requirement)
  const sorted = [...pending].sort(
    (a, b) => new Date(a.event_datetime) - new Date(b.event_datetime)
  );

  let synced = 0;
  let failed = 0;

  for (const event of sorted) {
    try {
      const { local_id, sync_status, created_at, retry_count, last_error, ...payload } = event;

      const { data } = await hosAPI.createEvent(payload);

      await markEventSynced(local_id, data.event);
      synced++;

      onProgress && onProgress(synced, pending.length);
      console.log(`[sync] ✓ Event synced (${synced}/${pending.length})`);

    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Unknown error';
      await markEventFailed(event.local_id, msg);
      failed++;
      console.error(`[sync] ✗ Event failed:`, msg);

      // If it's an auth error, stop syncing (user needs to re-login)
      if (err.response?.status === 401 || err.response?.status === 403) {
        console.warn('[sync] Auth error — stopping sync');
        break;
      }
    }
  }

  isSyncing = false;
  console.log(`[sync] Complete: ${synced} synced, ${failed} failed`);

  return { synced, failed };
}

/**
 * Check if there are pending events waiting to sync.
 */
export async function hasPending() {
  const count = await getPendingCount();
  return count > 0;
}

/**
 * Get the count of pending events.
 */
export { getPendingCount };
