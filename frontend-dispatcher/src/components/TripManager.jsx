/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\TripManager.jsx
 *
 * Управление рейсами:
 *   - Список активных рейсов
 *   - Создание нового рейса
 *   - Назначение водителя
 *   - Статусы: planned → active → completed
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

const STATUS_COLOR = {
  planned:   C.amber,
  active:    C.green,
  completed: C.muted,
  cancelled: C.red,
};

const STATUS_LABEL = {
  planned:   '📋 Planned',
  active:    '🚛 Active',
  completed: '✅ Completed',
  cancelled: '❌ Cancelled',
};

/* ── Демо-данные (заменить на API) ── */
const DEMO_TRIPS = [
  {
    id: 'T001',
    driver:   'John Smith',
    driverId: 'D001',
    from:     'Chicago, IL',
    to:       'Dallas, TX',
    miles:    921,
    cargo:    'Dry Van',
    status:   'active',
    eta:      '2026-05-18 14:00',
  },
  {
    id: 'T002',
    driver:   'Maria Garcia',
    driverId: 'D002',
    from:     'Los Angeles, CA',
    to:       'Phoenix, AZ',
    miles:    372,
    cargo:    'Reefer',
    status:   'planned',
    eta:      '2026-05-19 09:00',
  },
];

/* ── Форма создания рейса ── */
function NewTripForm({ drivers, onSave, onCancel }) {
  const [form, setForm] = useState({
    driverId: '',
    from:     '',
    to:       '',
    miles:    '',
    cargo:    'Dry Van',
    eta:      '',
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const valid = form.driverId && form.from && form.to && form.miles;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: C.surface, borderRadius: 14,
        border: `1px solid ${C.border}`,
        width: 480, maxHeight: '90vh', overflowY: 'auto',
        padding: 24,
      }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
          🚛 New Trip
        </h2>

        {/* Driver */}
        <label style={labelStyle}>
          <span style={labelText}>Driver</span>
          <select
            value={form.driverId}
            onChange={e => set('driverId', e.target.value)}
            style={inputStyle}
          >
            <option value="">— Select driver —</option>
            {Object.values(drivers).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
            {/* Фолбэк если нет онлайн водителей */}
            {Object.keys(drivers).length === 0 && (
              <option value="D001">John Smith (demo)</option>
            )}
          </select>
        </label>

        {/* From / To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={labelStyle}>
            <span style={labelText}>From</span>
            <input
              placeholder="Chicago, IL"
              value={form.from}
              onChange={e => set('from', e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>To</span>
            <input
              placeholder="Dallas, TX"
              value={form.to}
              onChange={e => set('to', e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        {/* Miles / Cargo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={labelStyle}>
            <span style={labelText}>Miles</span>
            <input
              type="number"
              placeholder="500"
              value={form.miles}
              onChange={e => set('miles', e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Cargo Type</span>
            <select
              value={form.cargo}
              onChange={e => set('cargo', e.target.value)}
              style={inputStyle}
            >
              <option>Dry Van</option>
              <option>Reefer</option>
              <option>Flatbed</option>
              <option>Hotshot</option>
              <option>LTL</option>
              <option>Tanker</option>
            </select>
          </label>
        </div>

        {/* ETA */}
        <label style={labelStyle}>
          <span style={labelText}>ETA</span>
          <input
            type="datetime-local"
            value={form.eta}
            onChange={e => set('eta', e.target.value)}
            style={inputStyle}
          />
        </label>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={onCancel} style={btnOutline}>Cancel</button>
          <button
            onClick={() => valid && onSave(form)}
            style={{ ...btnPrimary, opacity: valid ? 1 : 0.4 }}
            disabled={!valid}
          >
            Create Trip
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Карточка рейса ── */
function TripCard({ trip, onStatusChange }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>#{trip.id}</span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: STATUS_COLOR[trip.status],
        }}>
          {STATUS_LABEL[trip.status]}
        </span>
      </div>

      <div style={{ fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: C.muted }}>👤 </span>{trip.driver}
      </div>

      <div style={{ fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: C.green }}>📍 {trip.from}</span>
        <span style={{ color: C.muted }}> → </span>
        <span style={{ color: C.blue }}>{trip.to}</span>
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.muted, marginBottom: 10 }}>
        <span>🛣️ {trip.miles} mi</span>
        <span>📦 {trip.cargo}</span>
        {trip.eta && <span>🕐 ETA: {new Date(trip.eta).toLocaleString()}</span>}
      </div>

      {/* Смена статуса */}
      {trip.status !== 'completed' && trip.status !== 'cancelled' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {trip.status === 'planned' && (
            <button
              onClick={() => onStatusChange(trip.id, 'active')}
              style={{ ...btnSmall, background: 'rgba(34,197,94,0.15)', color: C.green }}>
              ▶ Activate
            </button>
          )}
          {trip.status === 'active' && (
            <button
              onClick={() => onStatusChange(trip.id, 'completed')}
              style={{ ...btnSmall, background: 'rgba(34,197,94,0.15)', color: C.green }}>
              ✅ Complete
            </button>
          )}
          <button
            onClick={() => onStatusChange(trip.id, 'cancelled')}
            style={{ ...btnSmall, background: 'rgba(239,68,68,0.1)', color: C.red }}>
            ✕ Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Главный компонент ── */
export default function TripManager({ drivers, onClose }) {
  const [trips,     setTrips]     = useState(DEMO_TRIPS);
  const [showForm,  setShowForm]  = useState(false);
  const [filter,    setFilter]    = useState('all');

  const handleSave = (form) => {
    const driver = Object.values(drivers).find(d => d.id === form.driverId);
    const newTrip = {
      id:       'T' + String(trips.length + 1).padStart(3, '0'),
      driver:   driver?.name || 'Unknown',
      driverId: form.driverId,
      from:     form.from,
      to:       form.to,
      miles:    Number(form.miles),
      cargo:    form.cargo,
      status:   'planned',
      eta:      form.eta,
    };
    setTrips(prev => [newTrip, ...prev]);
    setShowForm(false);
  };

  const handleStatusChange = (id, status) => {
    setTrips(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const filtered = filter === 'all'
    ? trips
    : trips.filter(t => t.status === filter);

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
        width: 480, zIndex: 1001,
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
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>🗺️ Trip Management</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowForm(true)} style={btnPrimary}>
              + New Trip
            </button>
            <button onClick={onClose} style={btnOutline}>✕</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: `1px solid ${C.border}`,
          padding: '0 16px',
        }}>
          {['all', 'planned', 'active', 'completed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '10px 14px',
                border: 'none', background: 'none',
                color: filter === f ? C.blue : C.muted,
                fontWeight: filter === f ? 700 : 400,
                fontSize: 13, cursor: 'pointer',
                borderBottom: filter === f ? `2px solid ${C.blue}` : '2px solid transparent',
                textTransform: 'capitalize',
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* Trip list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {filtered.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              No trips found
            </div>
          )}
          {filtered.map(trip => (
            <TripCard
              key={trip.id}
              trip={trip}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </div>

      {/* New trip form modal */}
      {showForm && (
        <NewTripForm
          drivers={drivers}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </>
  );
}

/* ── Стили ── */
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 };
const labelText  = { fontSize: 12, color: C.muted, fontWeight: 600 };
const inputStyle = {
  padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.bg, color: C.text,
  fontSize: 14, outline: 'none', width: '100%',
};
const btnPrimary = {
  padding: '9px 18px', borderRadius: 8,
  background: C.blue, border: 'none',
  color: '#fff', fontWeight: 700,
  fontSize: 13, cursor: 'pointer',
};
const btnOutline = {
  padding: '9px 14px', borderRadius: 8,
  background: 'transparent',
  border: `1px solid ${C.border}`,
  color: C.sub, fontWeight: 600,
  fontSize: 13, cursor: 'pointer',
};
const btnSmall = {
  padding: '5px 12px', borderRadius: 6,
  border: 'none', fontWeight: 600,
  fontSize: 12, cursor: 'pointer',
};
