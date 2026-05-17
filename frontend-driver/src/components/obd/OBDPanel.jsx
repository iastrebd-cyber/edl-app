/**
 * C:\Users\RegenU3\eld-app\frontend-driver\src\components\obd\OBDPanel.jsx
 *
 * UI панель для подключения к OBD и отображения данных ECM.
 * Используется на DashboardPage.
 */

import { useOBD } from '../../hooks/useOBD';

const C = {
  bg:      '#0f172a',
  surface: '#1e293b',
  border:  '#334155',
  muted:   '#64748b',
  text:    '#f1f5f9',
  blue:    '#3b82f6',
  green:   '#22c55e',
  amber:   '#f59e0b',
  red:     '#ef4444',
};

function Gauge({ label, value, unit, color, max, icon }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{
      background: C.surface, borderRadius: 10,
      border: `1px solid ${C.border}`,
      padding: '12px 14px', flex: 1,
    }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 6 }}>
        {value}<span style={{ fontSize: 12, color: C.muted, marginLeft: 3 }}>{unit}</span>
      </div>
      <div style={{ background: C.border, borderRadius: 3, height: 4 }}>
        <div style={{
          height: 4, borderRadius: 3,
          width: `${pct}%`,
          background: color,
          transition: 'width 0.5s',
        }} />
      </div>
    </div>
  );
}

export default function OBDPanel() {
  const {
    connected, connecting, error, deviceName,
    speed, rpm, engineLoad, engineHours, engineOn,
    connect, disconnect,
  } = useOBD();

  return (
    <div style={{
      background: C.surface,
      borderRadius: 12,
      border: `1px solid ${C.border}`,
      padding: '14px',
      marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 12,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            🔌 ECM / OBD-II
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {connected
              ? `Connected: ${deviceName}`
              : 'Not connected — tap to pair'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Engine status */}
          {connected && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: engineOn ? C.green : C.muted,
              padding: '3px 10px', borderRadius: 20,
              background: engineOn ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
            }}>
              {engineOn ? '⚙️ Engine ON' : '⚙️ Engine OFF'}
            </span>
          )}

          {/* Connect / Disconnect */}
          <button
            onClick={connected ? disconnect : connect}
            disabled={connecting}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: connected ? 'rgba(239,68,68,0.15)' : C.blue,
              color: connected ? C.red : '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              opacity: connecting ? 0.6 : 1,
            }}>
            {connecting ? '⏳ Connecting…' : connected ? 'Disconnect' : '🔵 Connect OBD'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: C.red, fontSize: 12,
        }}>
          ❌ {error}
        </div>
      )}

      {/* Gauges — показываем только когда подключены */}
      {connected && (
        <div style={{ display: 'flex', gap: 10 }}>
          <Gauge
            label="Speed"     value={speed}       unit="mph"
            color={speed > 70 ? C.amber : C.green}
            max={80}          icon="🚀"
          />
          <Gauge
            label="RPM"       value={rpm}         unit="rpm"
            color={rpm > 3000 ? C.amber : C.blue}
            max={4000}        icon="⚙️"
          />
          <Gauge
            label="Load"      value={engineLoad}  unit="%"
            color={engineLoad > 80 ? C.red : C.blue}
            max={100}         icon="📊"
          />
          <Gauge
            label="Eng. Hours" value={engineHours} unit="h"
            color={C.muted}
            max={engineHours + 100} icon="⏱"
          />
        </div>
      )}

      {/* Не подключены — подсказка */}
      {!connected && !connecting && (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.15)',
          fontSize: 12, color: C.muted,
        }}>
          📋 FMCSA требует синхронизацию с ECM для сертифицированных ELD (49 CFR §395.26).
          Нажми <b style={{ color: C.text }}>Connect OBD</b> и выбери Bluetooth адаптер ELM327.
        </div>
      )}
    </div>
  );
}
