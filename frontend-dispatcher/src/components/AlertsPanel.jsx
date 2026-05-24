/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\AlertsPanel.jsx
 *
 * v2 — Real-Time Alerts (вдохновлено Stitch Fleet Command экраном)
 *   • Три уровня: CRITICAL / OPTIMIZATION / INFO
 *   • Цветные бейджи с glow
 *   • Timeline-стиль с временными метками
 *   • Кнопка VIEW_ALL
 */

const LEVEL_META = {
  critical: {
    label: 'CRITICAL',
    color: 'var(--danger)',
    bg:    'rgba(239,68,68,0.10)',
    border:'var(--danger)',
    glow:  'var(--danger-glow)',
    icon:  '⚡',
  },
  warning: {
    label: 'WARNING',
    color: 'var(--warning)',
    bg:    'rgba(249,115,22,0.10)',
    border:'var(--warning)',
    glow:  'var(--warning-glow)',
    icon:  '⚠',
  },
  optimization: {
    label: 'OPTIMIZATION',
    color: 'var(--secondary)',
    bg:    'rgba(74,142,255,0.10)',
    border:'var(--secondary)',
    glow:  'var(--secondary-glow)',
    icon:  '◈',
  },
  info: {
    label: 'INFO',
    color: 'var(--on-surface-dim)',
    bg:    'rgba(255,255,255,0.04)',
    border:'var(--outline)',
    glow:  'none',
    icon:  '·',
  },
};

// Маппинг старых типов на новые уровни
function resolveLevel(alert) {
  if (alert.level) return alert.level;
  if (alert.type === 'offline')  return 'critical';
  if (alert.type === 'hos')      return 'warning';
  if (alert.type === 'message')  return 'info';
  return 'info';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => resolveLevel(a) === 'critical').length;

  return (
    <div style={{
      borderBottom: '1px solid var(--outline)',
      background: 'var(--surface-low)',
    }}>
      {/* Заголовок */}
      <div style={{
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {/* Иконка с sonar если есть critical */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: criticalCount > 0 ? 'var(--danger)' : 'var(--warning)',
          display: 'inline-block',
          boxShadow: criticalCount > 0 ? '0 0 6px var(--danger)' : 'none',
          animation: criticalCount > 0 ? 'sonar-danger 1.2s ease-out infinite' : 'none',
          flexShrink: 0,
        }} />

        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--on-surface-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          flex: 1,
        }}>
          REAL_TIME_ALERTS
        </span>

        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--on-surface-dim)',
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}>
          VIEW_ALL_L
        </span>
      </div>

      {/* Список алертов */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {alerts.slice().reverse().map((alert, idx) => {
          const level = resolveLevel(alert);
          const meta  = LEVEL_META[level] || LEVEL_META.info;

          return (
            <div
              key={alert.id || idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '7px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                transition: 'background var(--ease-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Временная метка */}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--on-surface-dim)',
                flexShrink: 0,
                marginTop: 1,
                letterSpacing: '0.02em',
              }}>
                {formatTime(alert.at)}
              </span>

              {/* Текст */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--on-surface)',
                  lineHeight: 1.4,
                }}>
                  {alert.text}
                </div>
              </div>

              {/* Бейдж уровня */}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                color: meta.color,
                background: meta.bg,
                border: `1px solid ${meta.border}40`,
                padding: '2px 7px',
                borderRadius: 'var(--r-full)',
                flexShrink: 0,
                letterSpacing: '0.04em',
                boxShadow: level === 'critical' ? `0 0 8px ${meta.glow}` : 'none',
              }}>
                {meta.icon} {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
