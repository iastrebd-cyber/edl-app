/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\AlertsPanel.jsx
 */

const ALERT_ICON = {
  offline: '🔴',
  hos:     '🟡',
  message: '💬',
  default: '⚪',
};

export default function AlertsPanel({ alerts }) {
  if (alerts.length === 0) return null;

  return (
    <div style={{
      maxHeight: 180,
      overflowY: 'auto',
      borderBottom: '1px solid #334155',
    }}>
      <div style={{
        padding: '8px 14px 4px',
        fontSize: 11,
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        Alerts ({alerts.length})
      </div>

      {alerts.map(alert => (
        <div key={alert.id} style={{
          padding: '7px 14px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>
            {ALERT_ICON[alert.type] || ALERT_ICON.default}
          </span>
          <div>
            <div style={{ fontSize: 12, color: '#f1f5f9' }}>{alert.text}</div>
            <div style={{ fontSize: 10, color: '#475569' }}>
              {alert.at ? new Date(alert.at).toLocaleTimeString() : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
