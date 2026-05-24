/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\DriversList.jsx
 *
 * v2 — Fleet Command Cards (вдохновлено Stitch Fleet Command экраном)
 *   • Карточки вместо строк
 *   • HOS_REMAINING заметная метрика
 *   • Violation state с glow
 *   • Speed + idle time
 *   • Sonar pip для live/offline
 */

const STATUS_META = {
  OFF: { label: 'OFF_DUTY',  color: 'var(--status-off)',      bg: 'rgba(100,116,139,0.10)' },
  SB:  { label: 'SLEEPER',   color: 'var(--status-sb)',       bg: 'rgba(139,92,246,0.10)'  },
  D:   { label: 'DRIVING',   color: 'var(--status-driving)',  bg: 'rgba(0,229,255,0.10)'   },
  ON:  { label: 'ON_DUTY',   color: 'var(--status-on)',       bg: 'rgba(245,158,11,0.10)'  },
};

function formatHOS(hours) {
  if (hours == null || isNaN(hours)) return '--:--';
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function DriverCard({ driver, isSelected, onClick }) {
  const meta        = STATUS_META[driver.hosStatus] || STATUS_META.OFF;
  const hasViolation = driver.hosViolation || (driver.hosRemaining != null && driver.hosRemaining <= 0);
  const hosWarn     = driver.hosRemaining != null && driver.hosRemaining <= 1 && !hasViolation;

  return (
    <div
      onClick={onClick}
      style={{
        margin: '0 10px 8px',
        padding: 'var(--sp-3)',
        background: isSelected
          ? 'rgba(0,229,255,0.06)'
          : hasViolation
            ? 'rgba(239,68,68,0.06)'
            : 'var(--card-bg)',
        border: `1px solid ${
          isSelected
            ? 'var(--primary)'
            : hasViolation
              ? 'var(--danger)'
              : 'var(--card-border)'
        }`,
        borderLeft: `3px solid ${
          isSelected
            ? 'var(--primary)'
            : hasViolation
              ? 'var(--danger)'
              : meta.color
        }`,
        borderRadius: 'var(--r-lg)',
        cursor: 'pointer',
        transition: 'all var(--ease-fast)',
        boxShadow: hasViolation
          ? '0 0 12px var(--danger-glow)'
          : isSelected
            ? '0 0 12px var(--primary-glow)'
            : 'none',
      }}
    >
      {/* Строка 1: Статус + имя + HOS_REMAINING */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {/* Status badge */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          color: hasViolation ? 'var(--danger)' : meta.color,
          background: hasViolation ? 'rgba(239,68,68,0.12)' : meta.bg,
          padding: '2px 7px',
          borderRadius: 'var(--r-full)',
          border: `1px solid ${hasViolation ? 'var(--danger)' : meta.color}40`,
          letterSpacing: '0.06em',
          flexShrink: 0,
        }}>
          {hasViolation ? '⚡ HOS_VIOLATION' : `▶ ${meta.label}`}
        </span>

        <span style={{ flex: 1 }} />

        {/* HOS remaining */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          color: hasViolation
            ? 'var(--danger)'
            : hosWarn
              ? 'var(--warning)'
              : 'var(--on-surface-muted)',
          letterSpacing: '-0.01em',
        }}>
          HOS_REM&nbsp;
          <span style={{
            color: hasViolation ? 'var(--danger)' : hosWarn ? 'var(--warning)' : 'var(--primary)',
            fontSize: 13,
          }}>
            {formatHOS(driver.hosRemaining)}
          </span>
        </span>
      </div>

      {/* Строка 2: Имя + ID */}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 14,
        color: 'var(--on-surface)',
        marginBottom: 6,
      }}>
        {driver.name}
        {driver.vehicleId && (
          <span style={{
            marginLeft: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 400,
            color: 'var(--on-surface-dim)',
          }}>
            · {driver.vehicleId}
          </span>
        )}
      </div>

      {/* Строка 3: Метрики */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 4,
      }}>
        <Metric label="SPEED" value={`${driver.speed || 0} MPH`} />
        <Metric
          label="LOCATION"
          value={driver.latitude
            ? `${driver.latitude.toFixed(1)}°, ${driver.longitude.toFixed(1)}°`
            : 'NO_GPS'}
        />
        <Metric
          label="STATUS"
          value={driver.online ? 'LIVE' : 'OFFLINE'}
          valueColor={driver.online ? 'var(--ok)' : 'var(--danger)'}
          pulse={driver.online}
        />
      </div>
    </div>
  );
}

function Metric({ label, value, valueColor, pulse }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 'var(--r-sm)',
      padding: '4px 6px',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 8,
        color: 'var(--on-surface-dim)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        color: valueColor || 'var(--on-surface)',
        letterSpacing: '0.02em',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}>
        {pulse && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--ok)',
            flexShrink: 0,
            animation: 'sonar 2s ease-out infinite',
            boxShadow: '0 0 4px var(--ok)',
          }} />
        )}
        {value}
      </div>
    </div>
  );
}

export default function DriversList({ drivers, selected, onSelect }) {
  const list = Object.values(drivers);

  const violations = list.filter(d => d.hosViolation || (d.hosRemaining != null && d.hosRemaining <= 0));
  const driving    = list.filter(d => d.hosStatus === 'D' && !violations.includes(d));
  const rest       = list.filter(d => !violations.includes(d) && !driving.includes(d));

  // Сортировка: violations → driving → остальные
  const sorted = [...violations, ...driving, ...rest];

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      borderTop: '1px solid var(--outline)',
    }}>
      {/* Заголовок */}
      <div style={{
        padding: '10px 14px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--on-surface-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          QUERY_ASSET_ID
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--primary)',
        }}>
          {list.length} UNITS
        </span>
      </div>

      {list.length === 0 ? (
        <div style={{
          padding: '32px 14px',
          color: 'var(--on-surface-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.06em',
          textAlign: 'center',
        }}>
          NO_UNITS_ONLINE
        </div>
      ) : (
        <div style={{ paddingTop: 4 }}>
          {sorted.map(driver => (
            <DriverCard
              key={driver.id}
              driver={driver}
              isSelected={selected === driver.id}
              onClick={() => onSelect(driver.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
