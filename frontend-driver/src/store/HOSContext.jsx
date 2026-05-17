/**
 * src/store/HOSContext.jsx
 *
 * Global HOS state: remaining hours, current status, violations.
 * Polls the backend every 60 seconds while the app is open.
 * Also provides actions: changeStatus, refreshHOS.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { hosAPI, sessionsAPI } from '../api/client';
import { useAuth } from './AuthContext';

const HOSContext = createContext(null);

const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

export function HOSProvider({ children }) {
  const { driver } = useAuth();

  const [hos,        setHos]        = useState(null);
  const [session,    setSession]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const pollTimer = useRef(null);

  // ── Fetch today's session ─────────────────────────────────
  const loadSession = useCallback(async () => {
    if (!driver) return;
    try {
      const { data } = await sessionsAPI.getToday();
      setSession(data.session);
      return data.session;
    } catch (err) {
      console.error('loadSession error', err);
    }
  }, [driver]);

  // ── Fetch current HOS remaining ───────────────────────────
  const refreshHOS = useCallback(async () => {
    if (!driver?.id) return;
    try {
      setLoading(true);
      const { data } = await hosAPI.getDriverHOS(driver.id);
      setHos(data.hos);
      if (data.session) setSession(data.session);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load HOS data');
    } finally {
      setLoading(false);
    }
  }, [driver?.id]);

  // ── Change duty status ────────────────────────────────────
  const changeStatus = useCallback(async ({
    eventCode,        // '1'=OFF '2'=SB '3'=D '4'=ON
    specialCondition, // 'personal_conveyance' | 'yard_move' | null
    annotation,
    latitude,
    longitude,
  }) => {
    if (!session?.id) throw new Error('No active session');

    const { data } = await hosAPI.createEvent({
      session_id:        session.id,
      event_type:        1,
      event_code:        eventCode,
      event_datetime:    new Date().toISOString(),
      latitude:          latitude  || null,
      longitude:         longitude || null,
      record_origin:     '1',  // ELD recorded
      special_condition: specialCondition || null,
      annotation:        annotation || null,
    });

    // Update HOS immediately from response
    setHos(data.hos);
    return data;
  }, [session?.id]);

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    if (!driver) return;

    loadSession().then(() => refreshHOS());

    // Start polling
    pollTimer.current = setInterval(refreshHOS, POLL_INTERVAL_MS);

    return () => clearInterval(pollTimer.current);
  }, [driver, loadSession, refreshHOS]);

  return (
    <HOSContext.Provider value={{
      hos,
      session,
      loading,
      error,
      changeStatus,
      refreshHOS,
      loadSession,
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
