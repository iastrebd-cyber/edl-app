/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\App.jsx
 */
import { useState } from 'react';
import FleetMap          from './components/FleetMap';
import DriversList       from './components/DriversList';
import AlertsPanel       from './components/AlertsPanel';
import TripManager       from './components/TripManager';
import ComplianceReports from './components/ComplianceReports';
import { useWebSocket }  from './hooks/useWebSocket';
import './App.css';

export default function App() {
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showTrips,      setShowTrips]      = useState(false);
  const [showReports,    setShowReports]    = useState(false);

  const TOKEN = localStorage.getItem('dispatcher_token') || 'DEMO';
  const { drivers, alerts, connected } = useWebSocket(
    `ws://localhost:3000/ws?token=${TOKEN}`
  );

  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: '#0f172a', color: '#f1f5f9',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* ── Левая панель ── */}
      <div style={{
        width: 300, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #334155', flexShrink: 0,
      }}>
        {/* Шапка */}
        <div style={{
          padding: '14px 16px', background: '#1e293b',
          borderBottom: '1px solid #334155',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 20 }}>🚛</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Fleet Dashboard</div>
            <div style={{ fontSize: 11, color: connected ? '#22c55e' : '#ef4444' }}>
              {connected ? '● Live' : '○ Disconnected'}
            </div>
          </div>
          {/* Кнопки */}
          <button onClick={() => { setShowTrips(true); setShowReports(false); }}
            style={navBtn('#3b82f6')}>
            🗺️
          </button>
          <button onClick={() => { setShowReports(true); setShowTrips(false); }}
            style={navBtn('#22c55e')}>
            📊
          </button>
        </div>

        <AlertsPanel alerts={alerts} />
        <DriversList
          drivers={drivers}
          selected={selectedDriver}
          onSelect={setSelectedDriver}
        />
      </div>

      {/* ── Карта ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <FleetMap
          drivers={drivers}
          selected={selectedDriver}
          onSelect={setSelectedDriver}
        />
      </div>

      {/* ── Trip Manager ── */}
      {showTrips && (
        <TripManager drivers={drivers} onClose={() => setShowTrips(false)} />
      )}

      {/* ── Compliance Reports ── */}
      {showReports && (
        <ComplianceReports onClose={() => setShowReports(false)} />
      )}

    </div>
  );
}

function navBtn(color) {
  return {
    padding: '6px 10px', borderRadius: 7,
    background: `${color}22`,
    border: `1px solid ${color}44`,
    color, fontSize: 16,
    cursor: 'pointer', lineHeight: 1,
  };
}
