/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\App.jsx
 *
 * v2 — Cybernetic Fleet Command
 *   • FleetStatsBar — sticky footer с агрегатами
 *   • Violation badge передаётся в FleetMap
 *   • Живые часы в шапке
 *   • Фильтры ALL / DRIVING / ON_DUTY
 */

import { useState, useEffect, useMemo } from 'react';
import FleetMap          from './components/FleetMap';
import DriversList       from './components/DriversList';
import AlertsPanel       from './components/AlertsPanel';
import TripManager       from './components/TripManager';
import ComplianceReports from './components/ComplianceReports';
import CarrierSettings   from './components/CarrierSettings';
import FleetStatsBar     from './components/FleetStatsBar';
import { useWebSocket }  from './hooks/useWebSocket';
import './App.css';

const FILTERS = ['ALL_UNITS', 'DRIVING', 'ON_DUTY'];

export default function App() {
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showTrips,      setShowTrips]      = useState(false);
  const [showReports,    setShowReports]    = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [activeFilter,   setActiveFilter]   = useState('ALL_UNITS');
  const [time,           setTime]           = useState(new Date());

  const TOKEN = localStorage.getItem('dispatcher_token') || 'DEMO';
  const { drivers, alerts, connected } = useWebSocket(
    `ws://localhost:3000/ws?token=${TOKEN}`
  );

  // Живые часы
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Фильтрация
  const filteredDrivers = useMemo(() => {
    const all = Object.values(drivers);
    if (activeFilter === 'DRIVING')  return Object.fromEntries(all.filter(d => d.hosStatus === 'D').map(d => [d.id, d]));
    if (activeFilter === 'ON_DUTY')  return Object.fromEntries(all.filter(d => d.hosStatus === 'ON' || d.hosStatus === 'D').map(d => [d.id, d]));
    return drivers;
  }, [drivers, activeFilter]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--surface-dim)',
      color: 'var(--on-surface)',
      fontFamily: 'var(--font-body)',
      overflow: 'hidden',
    }}>

      {/* ══ Левая панель ══ */}
      <div style={{
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--outline)',
        flexShrink: 0,
        background: 'var(--surface-low)',
      }}>

        {/* Шапка */}
        <div style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--outline)',
          background: 'var(--surface-mid)',
        }}>
          {/* Логотип */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 16,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
            }}>
              FLEET<span style={{ color: 'var(--primary)' }}>_COMMAND</span>
              <span style={{
                marginLeft: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 400,
                color: 'var(--on-surface-dim)',
              }}>V2.0</span>
            </div>

            <span style={{ flex: 1 }} />

            {/* Live indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: connected ? 'var(--ok)' : 'var(--danger)',
              letterSpacing: '0.04em',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: connected ? 'var(--ok)' : 'var(--danger)',
                animation: connected ? 'sonar 2s ease-out infinite' : 'none',
                boxShadow: connected ? '0 0 6px var(--ok)' : 'none',
              }} />
              {connected ? 'LIVE' : 'DISCONNECTED'}
            </div>
          </div>

          {/* Живые часы */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--on-surface-dim)',
            letterSpacing: '0.06em',
            marginBottom: 10,
          }}>
            {time.toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            }).toUpperCase()}
          </div>

          {/* Фильтры */}
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--r-full)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  border: `1px solid ${activeFilter === f ? 'var(--primary)' : 'var(--outline)'}`,
                  background: activeFilter === f ? 'var(--primary-glow)' : 'transparent',
                  color: activeFilter === f ? 'var(--primary)' : 'var(--on-surface-dim)',
                  transition: 'all var(--ease-fast)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '8px 14px',
          borderBottom: '1px solid var(--outline)',
        }}>
          <ActionBtn
            label="TRIPS"
            icon="🗺️"
            active={showTrips}
            onClick={() => { setShowTrips(v => !v); setShowReports(false); setShowSettings(false); }}
          />
          <ActionBtn
            label="REPORTS"
            icon="📊"
            active={showReports}
            onClick={() => { setShowReports(v => !v); setShowTrips(false); setShowSettings(false); }}
          />
          <ActionBtn
            label="SETTINGS"
            icon="⚙️"
            active={showSettings}
            onClick={() => { setShowSettings(v => !v); setShowTrips(false); setShowReports(false); }}
          />
        </div>

        {/* Алерты */}
        <AlertsPanel alerts={alerts} />

        {/* Список водителей */}
        <DriversList
          drivers={filteredDrivers}
          selected={selectedDriver}
          onSelect={setSelectedDriver}
        />
      </div>

      {/* ══ Правая часть: карта ══ */}
      <div style={{ flex: 1, position: 'relative' }}>
        <FleetMap
          drivers={drivers}
          selected={selectedDriver}
          onSelect={setSelectedDriver}
        />

        {/* ── Fleet Stats Bar (sticky bottom center) ── */}
        <FleetStatsBar drivers={drivers} alerts={alerts} />
      </div>

      {/* ══ Trip Manager ══ */}
      {showTrips && (
        <TripManager drivers={drivers} onClose={() => setShowTrips(false)} />
      )}

      {/* ══ Compliance Reports ══ */}
      {showReports && (
        <ComplianceReports onClose={() => setShowReports(false)} />
      )}

      {/* ══ Carrier Settings ══ */}
      {showSettings && (
        <CarrierSettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ActionBtn({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 12px',
        borderRadius: 'var(--r-md)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--outline)'}`,
        background: active ? 'var(--primary-glow)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--on-surface-dim)',
        transition: 'all var(--ease-fast)',
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
