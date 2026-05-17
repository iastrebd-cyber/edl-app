/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\hooks\useWebSocket.js
 *
 * Хук для подключения к WebSocket серверу.
 * Обрабатывает: driver_location, driver_offline, driver_hos_change, alerts.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url) {
  const [drivers,   setDrivers]   = useState({});   // { driverId: driverData }
  const [alerts,    setAlerts]    = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('[WS] Connected to dispatcher feed');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('[WS] Disconnected — reconnecting in 5s...');
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, [url]);

  function handleMessage(msg) {
    switch (msg.type) {

      case 'driver_location':
        setDrivers(prev => ({
          ...prev,
          [msg.driverId]: {
            ...prev[msg.driverId],
            id:        msg.driverId,
            name:      msg.name,
            latitude:  msg.latitude,
            longitude: msg.longitude,
            speed:     msg.speed,
            heading:   msg.heading,
            hosStatus: msg.hosStatus,
            odometer:  msg.odometer,
            lastSeen:  msg.at,
            online:    true,
          },
        }));
        break;

      case 'driver_offline':
        setDrivers(prev => ({
          ...prev,
          [msg.driverId]: {
            ...prev[msg.driverId],
            online: false,
            lastSeen: msg.at,
          },
        }));
        addAlert({ type: 'offline', text: `${msg.name} went offline`, at: msg.at });
        break;

      case 'driver_hos_change':
        setDrivers(prev => ({
          ...prev,
          [msg.driverId]: {
            ...prev[msg.driverId],
            hosStatus: msg.newStatus,
          },
        }));
        if (msg.newStatus === 'D') {
          addAlert({ type: 'hos', text: `${msg.name} started driving`, at: msg.at });
        }
        break;

      case 'message_from_driver':
        addAlert({ type: 'message', text: `${msg.name}: ${msg.text}`, at: msg.at });
        break;

      default:
        break;
    }
  }

  function addAlert(alert) {
    setAlerts(prev => [{ ...alert, id: Date.now() }, ...prev].slice(0, 50));
  }

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { drivers, alerts, connected };
}
