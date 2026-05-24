/**
 * src/components/hos/HOSHero.jsx
 *
 * Главный визуальный акцент DashboardPage — большой HOS-циферблат.
 * Вдохновлён Stitch "Driver Dashboard" экраном.
 *
 * Props:
 *   hos            — объект из HOSContext
 *   currentStatus  — 'OFF' | 'SB' | 'D' | 'ON'
 */

const STATUS_META = {
  OFF: { label: 'Off Duty',      color: 'var(--status-off)',     hours: null },
  SB:  { label: 'Sleeper Berth', color: 'var(--status-sb)',      hours: null },
  D:   { label: 'Driving',       color: 'var(--status-driving)', hours: 'driving_remaining'  },
  ON:  { label: 'On Duty',       color: 'var(--status-on)',      hours: 'shift_remaining'    },
};

function formatTime(hours) {
  if (hours == null || isNaN(hours)) return '--:--';
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatShiftEnd(shiftRem) {
  if (shiftRem == null) return '--:--';
  const now = new Date();
  const endMs = now.getTime() + shiftRem * 3600000;
  const end = new Date(endMs);
  return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HOSHero({ hos, currentStatus = 'OFF' }) {
  const meta       = STATUS_META[currentStatus] || STATUS_META.OFF;
  const hoursKey   = meta.hours;
  const hoursLeft  = hoursKey ? hos?.[hoursKey] : null;
  const maxHours   = currentStatus === 'D' ? 11 : 14;

  const ratio      = hoursLeft != null
    ? Math.min(1, Math.max(0, hoursLeft / maxHours))
    : 0;

  // Цвет дуги по оставшемуся времени
  const arcColor = hoursLeft == null
    ? meta.color
    : hoursLeft <= 1
      ? 'var(--danger)'
      : hoursLeft <= 2
        ? 'var(--warning)'
        : meta.color;

  // SVG параметры
  const SIZE  = 220;
  const R     = 92;
  const circ  = 2 * Math.PI * R;
  const arc   = circ * ratio;

  const isActive = currentStatus === 'D' || currentStatus === 'ON';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 'var(--sp-5) var(--sp-4) var(--sp-4)',
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderTopColor: arcColor,
      borderRadius: 'var(--r-xl)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Фоновое свечение */}
      {isActive && (
        <div style={{
          position: 'absolute',
          top: -40,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${arcColor}18 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Лейбл секции */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--primary)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: 'var(--sp-3)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isActive ? 'var(--primary)' : 'var(--on-surface-dim)',
          boxShadow: isActive ? '0 0 6px var(--primary)' : 'none',
          animation: isActive ? 'sonar 2s ease-out infinite' : 'none',
          display: 'inline-block',
        }} />
        REAL-TIME TELEMETRY
      </div>

      {/* Большой циферблат */}
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Внешняя декоративная дуга — dim */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R + 8}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={2}
            strokeDasharray="4 6"
          />
          {/* Фоновый трек */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={14}
          />
          {/* Активная дуга */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke={arcColor}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ - arc}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{
              transition: 'stroke-dasharray var(--ease-slow), stroke var(--ease-mid)',
              filter: `drop-shadow(0 0 10px ${arcColor}) drop-shadow(0 0 24px ${arcColor}40)`,
            }}
          />

          {/* Внутренний контент */}
          {/* Основная цифра */}
          <text
            x={SIZE / 2} y={SIZE / 2 - 10}
            textAnchor="middle"
            fill={isActive ? arcColor : 'var(--on-surface-muted)'}
            fontSize="42"
            fontWeight="700"
            fontFamily="'Space Grotesk', sans-serif"
            letterSpacing="-1"
          >
            {isActive ? formatTime(hoursLeft) : '--:--'}
          </text>

          {/* Подпись под цифрой */}
          <text
            x={SIZE / 2} y={SIZE / 2 + 16}
            textAnchor="middle"
            fill="var(--on-surface-dim)"
            fontSize="10"
            fontFamily="'Geist Mono', monospace"
            letterSpacing="3"
          >
            {isActive ? 'TIME REMAINING' : 'NOT ACTIVE'}
          </text>

          {/* Статус-лейбл */}
          <text
            x={SIZE / 2} y={SIZE / 2 + 36}
            textAnchor="middle"
            fill={meta.color}
            fontSize="12"
            fontWeight="600"
            fontFamily="'Space Grotesk', sans-serif"
            letterSpacing="1"
          >
            {currentStatus === 'D' ? 'DRIVE MODE ACTIVE' : meta.label.toUpperCase()}
          </text>
        </svg>
      </div>

      {/* Три метрики под циферблатом */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 'var(--sp-2)',
        width: '100%',
        marginTop: 'var(--sp-4)',
      }}>
        {[
          {
            label: 'DUTY TIME',
            value: formatTime(
              hos?.shift_remaining != null
                ? 14 - (hos.shift_remaining || 0)
                : null
            ),
            color: 'var(--on-surface)',
          },
          {
            label: 'SHIFT END',
            value: formatShiftEnd(hos?.shift_remaining),
            color: 'var(--on-surface)',
          },
          {
            label: 'BREAK REQ',
            value: formatTime(hos?.break_needed_in),
            color: hos?.break_needed_in != null && hos.break_needed_in <= 0.5
              ? 'var(--danger)'
              : 'var(--warning)',
          },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--outline-bright)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-2) var(--sp-2)',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              fontWeight: 600,
              color,
              letterSpacing: '-0.02em',
            }}>
              {value}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--on-surface-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* 70-hour cycle bar */}
      {hos?.cycle_remaining != null && (
        <div style={{ width: '100%', marginTop: 'var(--sp-4)' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--on-surface-dim)',
            marginBottom: 4,
          }}>
            <span>70-HOUR CYCLE</span>
            <span style={{ color: 'var(--primary)' }}>
              {formatTime(hos.cycle_remaining)} left
            </span>
          </div>
          <div style={{
            height: 4,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 'var(--r-full)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, ((hos.cycle_remaining || 0) / 70) * 100)}%`,
              background: 'linear-gradient(90deg, var(--primary-dim), var(--primary))',
              borderRadius: 'var(--r-full)',
              boxShadow: '0 0 8px var(--primary-glow)',
              transition: 'width var(--ease-slow)',
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--on-surface-dim)',
            marginTop: 3,
          }}>
            <span>USED: {formatTime(70 - (hos.cycle_remaining || 0))}H</span>
            <span>LIMIT: 70.0H</span>
          </div>
        </div>
      )}
    </div>
  );
}
