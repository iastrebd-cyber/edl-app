/**
 * src/store/HOSContext.jsx
 *
 * Global HOS state with offline-first support.
 * When offline: queues events in IndexedDB.
 * When back online: auto-syncs via syncQueue.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { hosAPI, sessionsAPI, dvirAPI } from '../api/client';
import { useAuth }             from './AuthContext';
import { queueEvent, cacheSession, cacheEvents } from '../utils/offlineDB';
import { flush }               from '../utils/syncQueue';

const HOSContext = createContext(null);
const POLL_INTERVAL_MS = 60 * 1000;

export function HOSProvider({ children }) {
  const { driver } = useAuth();

  const [hos,          setHos]          = useState(null);
  const [session,      setSession]      = useState(null);
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  /**
   * pretripStatus — result of the most recent /dvir/pretrip-status call.
   * null  = not checked yet
   * { completed: bool, safe_to_operate: bool|null, report: obj|null }
   */
  const [pretripStatus, setPretripStatus] = useState(null);

  const pollTimer = useRef(null);

  /**
   * Check pre-trip DVIR status for today's session.
   * Silently fails if offline — the StatusChangePanel will re-try on confirm.
   */
  const checkPretrip = useCallback(async (sessionId) => {
    try {
      const { data } = await dvirAPI.checkPretrip(sessionId);
      setPretripStatus(data);
      return data;
    } catch (err) {
      // Offline or server error — don't block the UI, but keep status as unknown
      console.warn('[hos] checkPretrip failed (offline?):', err.message);
      return null;
    }
  }, []);

  const loadSession = useCallback(async () => {
    if (!driver) return;
    try {
      const { data } = await sessionsAPI.getToday();
      setSession(data.session);
      await cacheSession(data.session);
      return data.session;
    } catch (err) {
      console.error('loadSession error', err);
    }
  }, [driver]);

  const refreshHOS = useCallback(async () => {
    if (!driver?.id) return;
    try {
      setLoading(true);
      const { data } = await hosAPI.getDriverHOS(driver.id);
      setHos(data.hos);
      if (data.session) {
        setSession(data.session);
        await cacheSession(data.session);
      }
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load HOS data');
    } finally {
      setLoading(false);
    }
  }, [driver?.id]);

  const changeStatus = useCallback(async ({
    eventCode, specialCondition, annotation, latitude, longitude,
  }) => {
    if (!session?.id) throw new Error('No active session');

    const eventPayload = {
      session_id:        session.id,
      event_type:        1,
      event_code:        eventCode,
      event_datetime:    new Date().toISOString(),
      latitude:          latitude  || null,
      longitude:         longitude || null,
      record_origin:     '1',
      special_condition: specialCondition || null,
      annotation:        annotation || null,
    };

    if (!navigator.onLine) {
      // Offline: queue locally
      await queueEvent(eventPayload);
      setPendingCount(c => c + 1);
      console.log('[hos] Status queued offline:', eventCode);
      return { offline: true };
    }

    // Online: send immediately
    const { data } = await hosAPI.createEvent(eventPayload);
    setHos(data.hos);
    return data;
  }, [session?.id]);

  // Network listeners
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      const result = await flush();
      if (result.synced > 0) {
        setPendingCount(0);
        await refreshHOS();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshHOS]);

  useEffect(() => {
    if (!driver) return;
    loadSession().then((sess) => {
      refreshHOS();
      // Check pre-trip DVIR after session is loaded
      if (sess?.id) checkPretrip(sess.id);
    });
    pollTimer.current = setInterval(refreshHOS, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimer.current);
  }, [driver, loadSession, refreshHOS, checkPretrip]);

  return (
    <HOSContext.Provider value={{
      hos, session, loading, error,
      isOnline, pendingCount,
      pretripStatus,
      changeStatus, refreshHOS, loadSession, checkPretrip,
    }}>
      {children}
    </HOSContext.Provider>
  );
}

export const useHOS = () => {
  const ctx = useContext(HOSContext);
  if (!ctx) throw new Error('useHOS must be used within HOSProvider');
  return ctx;
};
