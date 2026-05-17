/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\ComplianceReports.jsx
 *
 * Compliance Reports для диспетчера:
 *   - HOS нарушения по водителям
 *   - Сводка по флоту за период
 *   - Экспорт в CSV
 */

import { useState } from 'react';

const C = {
  bg:      '#0f172a',
  surface: '#1e293b',
  border:  '#334155',
  muted:   '#64748b',
  text:    '#f1f5f9',
  sub:     '#94a3b8',
  blue:    '#3b82f6',
  green:   '#22c55e',
  amber:   '#f59e0b',
  red:     '#ef4444',
};

/* ── Демо-данные ── */
const DEMO_VIOLATIONS = [
  { id: 1, driver: 'John Smith',   type: 'HOS',      rule: '11-Hour Driving Limit', severity: 'critical', date: '2026-05-17', hours: 11.8 },
  { id: 2, driver: 'Maria Garcia', type: 'HOS',      rule: '14-Hour On-Duty Limit', severity: 'warning',  date: '2026-05-16', hours: 14.2 },
  { id: 3, driver: 'Bob Johnson',  type: 'DVIR',     rule: 'Missed Pre-Trip DVIR',  severity: 'warning',  date: '2026-05-15', hours: null },
  { id: 4, driver: 'John Smith',   type: 'HOS',      rule: '30-Min Break Required', severity: 'info',     date: '2026-05-14', hours: 8.5  },
  { id: 5, driver: 'Anna Lee',     type: 'Speeding', rule: 'Speed > 75 mph',        severity: 'warning',  date: '2026-05-13', hours: null },
];

const DEMO_SUMMARY = [
  { driver: 'John Smith',   driving: 9.5,  onDuty: 11.2, violations: 2, status: 'warning'  },
  { driver: 'Maria Garcia', driving: 7.2,  onDuty: 10.8, violations: 1, status: 'warning'  },
  { driver: 'Bob Johnson',  driving: 5.0,  onDuty: 7.5,  violations: 1, status: 'warning'  },
  { driver: 'Anna Lee',     driving: 8.1,  onDuty: 10.0, violations: 1, status: 'warning'  },
  { driver: 'Carlos Ruiz',  driving: 4.5,  onDuty: 6.0,  violations: 0, status: 'ok'       },
];

const SEV_COLOR = { critical: C.red, warning: C.amber, info: C.blue };
const SEV_ICON  = { critical: '🔴', warning: '🟡', info: '🔵' };

/* ── Экспорт CSV ── */
function exportCSV(data, filename) {
  const headers = Object.keys(data[0]).join(',');
  const rows    = data.map(r => Object.values(r).join(',')).join('\n');
  const blob    = new Blob([headers + '\n' + rows], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Строка нарушения ── */
function ViolationRow({ v }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{SEV_ICON[v.severity]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{v.driver}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{v.rule}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: 10, fontWeight: 700,
          color: SEV_COLOR[v.severity],
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {v.type}
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>{v.date}</div>
      </div>
    </div>
  );
}

/* ── Строка сводки ── */
function SummaryRow({ d }) {
  const pct = (d.driving / 11) * 100;
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{d.driver}</span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: d.status === 'ok' ? C.green : C.amber,
        }}>
          {d.violations} violation{d.violations !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.muted, marginBottom: 6 }}>
        <span>🚗 Driving: {d.driving}h</span>
        <span>⏱ On-Duty: {d.onDuty}h</span>
        <span>Remaining: {(11 - d.driving).toFixed(1)}h</span>
      </div>
      {/* HOS bar */}
      <div style={{ background: C.border, borderRadius: 4, height: 5 }}>
        <div style={{
          height: 5, borderRadius: 4,
          width: `${Math.min(pct, 100)}%`,
          background: pct > 90 ? C.red : pct > 70 ? C.amber : C.green,
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}

/* ── Главный компонент ── */
export default function ComplianceReports({ onClose }) {
  const [tab,      setTab]      = useState('violations');
  const [dateFrom, setDateFrom] = useState(todayMinus(7));
  const [dateTo,   setDateTo]   = useState(today());

  const criticalCount = DEMO_VIOLATIONS.filter(v => v.severity === 'critical').length;
  const warningCount  = DEMO_VIOLATIONS.filter(v => v.severity === 'warning').length;

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
      }} onClick={onClose} />

      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0,
        width: 520, zIndex: 1001,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 16px',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>📊 Compliance Reports</h2>
          <button onClick={onClose} style={btnOutline}>✕</button>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10, padding: '14px 16px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <StatCard label="Critical" value={criticalCount} color={C.red}   icon="🔴" />
          <StatCard label="Warnings" value={warningCount}  color={C.amber} icon="🟡" />
          <StatCard label="Drivers"  value={DEMO_SUMMARY.length} color={C.blue} icon="👤" />
        </div>

        {/* Date range */}
        <div style={{
          display: 'flex', gap: 10, padding: '10px 16px',
          borderBottom: `1px solid ${C.border}`,
          alignItems: 'center',
        }}>
          <input type="date" value={dateFrom} max={dateTo}
            onChange={e => setDateFrom(e.target.value)}
            style={inputStyle} />
          <span style={{ color: C.muted }}>→</span>
          <input type="date" value={dateTo} min={dateFrom} max={today()}
            onChange={e => setDateTo(e.target.value)}
            style={inputStyle} />
          <button
            onClick={() => exportCSV(DEMO_VIOLATIONS, `violations_${dateFrom}_${dateTo}.csv`)}
            style={{ ...btnOutline, whiteSpace: 'nowrap', fontSize: 12 }}>
            ⬇ CSV
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: `1px solid ${C.border}`,
          padding: '0 16px',
        }}>
          {[
            { id: 'violations', label: 'Violations' },
            { id: 'summary',    label: 'Driver Summary' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 16px', border: 'none', background: 'none',
              color: tab === t.id ? C.blue : C.muted,
              fontWeight: tab === t.id ? 700 : 400,
              fontSize: 13, cursor: 'pointer',
              borderBottom: tab === t.id ? `2px solid ${C.blue}` : '2px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'violations' && DEMO_VIOLATIONS.map(v => (
            <ViolationRow key={v.id} v={v} />
          ))}
          {tab === 'summary' && DEMO_SUMMARY.map(d => (
            <SummaryRow key={d.driver} d={d} />
          ))}
        </div>

      </div>
    </>
  );
}

/* ── Карточка статистики ── */
function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: C.surface, borderRadius: 10,
      border: `1px solid ${C.border}`,
      padding: '10px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
    </div>
  );
}

/* ── Стили ── */
const btnOutline = {
  padding: '7px 14px', borderRadius: 8,
  background: 'transparent', border: `1px solid ${C.border}`,
  color: C.sub, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const inputStyle = {
  padding: '7px 10px', borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.surface, color: C.text,
  fontSize: 13, outline: 'none',
};

function today() { return new Date().toISOString().split('T')[0]; }
function todayMinus(days) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
