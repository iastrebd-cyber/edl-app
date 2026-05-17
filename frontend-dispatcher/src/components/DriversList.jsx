/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\DriversList.jsx
 */

const HOS_COLOR = {
  OFF: '#64748b',
  SB:  '#8b5cf6',
  D:   '#22c55e',
  ON:  '#f59e0b',
};

const HOS_LABEL = {
  OFF: 'Off Duty',
  SB:  'Sleeper',
  D:   'Driving',
  ON:  'On Duty',
};

export default function DriversList({ drivers, selected, onSelect }) {
  const list = Object.values(drivers);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      borderTop: '1px solid #334155',
    }}>
      <div style={{
        padding: '10px 14px 6px',
        fontSize: 11,
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        Drivers ({list.length})
      </div>

      {list.length === 0 && (
        <div style={{ padding: '20px 14px', color: '#475569', fontSize: 13 }}>
          No drivers online
        </div>
      )}

      {list.map(driver => (
        <div
          key={driver.id}
          onClick={() => onSelect(driver.id)}
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #1e293b',
            cursor: 'pointer',
            background: selected === driver.id ? 'rgba(59,130,246,0.12)' : 'transparent',
            borderLeft: selected === driver.id ? '3px solid #3b82f6' : '3px solid transparent',
            transition: 'background 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{driver.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: HOS_COLOR[driver.hosStatus] || '#64748b',
              background: 'rgba(0,0,0,0.3)',
              padding: '2px 7px', borderRadius: 10,
            }}>
              {HOS_LABEL[driver.hosStatus] || driver.hosStatus || 'Unknown'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: '#64748b' }}>
            <span>🚀 {driver.speed || 0} mph</span>
            <span>📍 {driver.latitude ? `${driver.latitude.toFixed(2)}, ${driver.longitude.toFixed(2)}` : 'No GPS'}</span>
          </div>
          <div style={{ marginTop: 3, fontSize: 10, color: driver.online ? '#22c55e' : '#ef4444' }}>
            {driver.online ? '● Online' : '○ Offline'}
          </div>
        </div>
      ))}
    </div>
  );
}
