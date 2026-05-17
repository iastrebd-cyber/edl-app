/**
 * src/hooks/useNetworkStatus.js
 *
 * React hook that tracks online/offline status and
 * automatically triggers sync when coming back online.
 *
 * Usage:
 *   const { isOnline, pendingCount, isSyncing, syncNow } = useNetworkStatus();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { flush, getPendingCount }                    from '../utils/syncQueue';

export function useNetworkStatus() {
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [isSyncing,    setIsSyncing]    = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync,     setLastSync]     = useState(null);
  const [syncError,    setSyncError]    = useState(null);

  // Update pending count
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Manual or auto sync trigger
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      const result = await flush((synced, total) => {
        // Could update progress here
      });

      setLastSync(new Date());
      await refreshPendingCount();

      if (result.failed > 0) {
        setSyncError(`${result.failed} event(s) failed to sync`);
      }
    } catch (err) {
      setSyncError('Sync failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[network] Back online — triggering sync');
      syncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('[network] Gone offline');
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial pending count
    refreshPendingCount();

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, refreshPendingCount]);

  // Poll pending count every 30s
  useEffect(() => {
    const timer = setInterval(refreshPendingCount, 30000);
    return () => clearInterval(timer);
  }, [refreshPendingCount]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSync,
    syncError,
    syncNow,
    refreshPendingCount,
  };
}
