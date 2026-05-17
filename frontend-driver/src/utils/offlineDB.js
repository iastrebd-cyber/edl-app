/**
 * src/utils/offlineDB.js
 *
 * IndexedDB wrapper for offline-first HOS events.
 *
 * Stores events locally when there's no internet connection.
 * On reconnect, the sync queue flushes them to the backend.
 *
 * DB name:    eld_offline
 * Version:    1
 * Stores:
 *   - pending_events  — events waiting to be sent to server
 *   - synced_events   — events confirmed by server (cache)
 *   - pending_session — session metadata (shipping docs, trailers)
 *
 * Uses the 'idb' library for a Promise-based API over raw IndexedDB.
 */

import { openDB } from 'idb';

const DB_NAME    = 'eld_offline';
const DB_VERSION = 1;

// ── Open / initialize DB ──────────────────────────────────────
let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Pending events — not yet sent to server
        if (!db.objectStoreNames.contains('pending_events')) {
          const store = db.createObjectStore('pending_events', {
            keyPath:       'local_id',
            autoIncrement: true,
          });
          store.createIndex('by_session',  'session_id',  { unique: false });
          store.createIndex('by_created',  'created_at',  { unique: false });
          store.createIndex('by_status',   'sync_status', { unique: false });
        }

        // Synced events — confirmed by server (read cache)
        if (!db.objectStoreNames.contains('synced_events')) {
          const store = db.createObjectStore('synced_events', {
            keyPath: 'id',  // server UUID
          });
          store.createIndex('by_session',  'session_id',    { unique: false });
          store.createIndex('by_datetime', 'event_datetime', { unique: false });
        }

        // Session cache
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ─────────────────────────────────────────────────────────────
// PENDING EVENTS
// ─────────────────────────────────────────────────────────────

/**
 * Queue an event for later sync.
 * Called when user changes status and we're offline.
 *
 * @param {object} eventData  — same shape as POST /api/hos-events body
 * @returns {number} local_id
 */
export async function queueEvent(eventData) {
  const db = await getDB();
  const localId = await db.add('pending_events', {
    ...eventData,
    sync_status: 'pending',   // 'pending' | 'syncing' | 'failed'
    created_at:  new Date().toISOString(),
    retry_count: 0,
  });
  console.log('[offline] Event queued locally:', localId);
  return localId;
}

/**
 * Get all pending events (not yet synced).
 * @returns {object[]}
 */
export async function getPendingEvents() {
  const db = await getDB();
  return db.getAllFromIndex('pending_events', 'by_status', 'pending');
}

/**
 * Mark a pending event as successfully synced.
 * Removes from pending and adds to synced cache.
 *
 * @param {number} localId    — the local_id from pending_events
 * @param {object} serverEvent — the server response event object
 */
export async function markEventSynced(localId, serverEvent) {
  const db = await getDB();
  const tx = db.transaction(['pending_events', 'synced_events'], 'readwrite');

  // Remove from pending
  await tx.objectStore('pending_events').delete(localId);

  // Add to synced cache
  await tx.objectStore('synced_events').put(serverEvent);

  await tx.done;
  console.log('[offline] Event synced:', localId, '→', serverEvent.id);
}

/**
 * Mark a pending event as failed (will retry).
 * @param {number} localId
 * @param {string} errorMessage
 */
export async function markEventFailed(localId, errorMessage) {
  const db    = await getDB();
  const event = await db.get('pending_events', localId);
  if (!event) return;

  await db.put('pending_events', {
    ...event,
    sync_status:   'failed',
    retry_count:   (event.retry_count || 0) + 1,
    last_error:    errorMessage,
    last_retry_at: new Date().toISOString(),
  });
}

/**
 * Reset failed events back to pending (for manual retry).
 */
export async function resetFailedEvents() {
  const db      = await getDB();
  const failed  = await db.getAllFromIndex('pending_events', 'by_status', 'failed');

  for (const event of failed) {
    await db.put('pending_events', { ...event, sync_status: 'pending' });
  }

  return failed.length;
}

/**
 * Count of events waiting to sync.
 */
export async function getPendingCount() {
  const db = await getDB();
  return db.countFromIndex('pending_events', 'by_status', 'pending');
}

// ─────────────────────────────────────────────────────────────
// SYNCED EVENTS CACHE
// ─────────────────────────────────────────────────────────────

/**
 * Cache events from server response (for offline logbook display).
 * @param {object[]} events
 */
export async function cacheEvents(events) {
  const db = await getDB();
  const tx = db.transaction('synced_events', 'readwrite');
  for (const event of events) {
    await tx.store.put(event);
  }
  await tx.done;
}

/**
 * Get cached events for a session (for offline logbook).
 * @param {string} sessionId
 * @returns {object[]}
 */
export async function getCachedEvents(sessionId) {
  const db = await getDB();
  return db.getAllFromIndex('synced_events', 'by_session', sessionId);
}

// ─────────────────────────────────────────────────────────────
// SESSION CACHE
// ─────────────────────────────────────────────────────────────

/**
 * Cache today's session for offline access.
 * @param {object} session
 */
export async function cacheSession(session) {
  const db = await getDB();
  await db.put('sessions', session);
}

/**
 * Get cached session by ID.
 * @param {string} sessionId
 */
export async function getCachedSession(sessionId) {
  const db = await getDB();
  return db.get('sessions', sessionId);
}

/**
 * Clear all offline data (use on logout).
 */
export async function clearOfflineData() {
  const db = await getDB();
  const tx = db.transaction(
    ['pending_events', 'synced_events', 'sessions'],
    'readwrite'
  );
  await tx.objectStore('pending_events').clear();
  await tx.objectStore('synced_events').clear();
  await tx.objectStore('sessions').clear();
  await tx.done;
  console.log('[offline] All offline data cleared');
}
