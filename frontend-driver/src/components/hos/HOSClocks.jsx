/**
 * src/components/hos/HOSClocks.jsx
 *
 * Three real-time HOS countdown clocks:
 *   1. Driving remaining  (11h limit)
 *   2. Shift remaining    (14h window)
 *   3. Cycle remaining    (70h / 8-day)
 *
 * Color states:
 *   green  → > 2h remaining
 *   yellow → 1–2h remaining (warning)
 *   red    → < 1h remaining or violation
 */

import { useTranslation } from 'react-i18next';

function formatTime(hours) {
  if (hours == null || isNaN(hours)) return '--:--';
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getColor(hours) {
  if (hours == null) return '#64748b';
  if (hours <= 0)    return '#ef4444';  // red — at limit
  if (hours <= 1)    return '#f97316';  // orange — warning
  if (hours <= 2)    return '#eab308';  // yellow — caution
  return '#22c55e';                     // green — ok
}

function Clock({ label, hours, showMinutes = false }) {
  const color = getColor(hours);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 8px',
      background: '#1e293b',
      borderRadius: 12,
      gap: 4,
    }}>
      {/* Ring indicator */}
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="34"
          fill="none" stroke="#334155" strokeWidth="8" />
        <circle cx="40" cy="40" r="34"
          fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 34}`}
          strokeDashoffset={`${2 * Math.PI * 34 * (1 - Math.min(1, Math.max(0, hours || 0) / 14))}`}
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
        <text x="40" y="44"
          textAnchor="middle"
          fill={color}
          fontSize="16"
          fontWeight="700"
          fontFamily="monospace">
          {formatTime(hours)}
        </text>
      </svg>

      <span style={{
        fontSize: 11,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: 'center',
      }}>
        {label}
      </span>
    </div>
  );
}

export default function HOSClocks({ hos }) {
  const { t } = useTranslation();

  // Break indicator — separate small badge
  const breakIn    = hos?.break_needed_in;
  const needsBreak = breakIn != null && breakIn <= 0;
  const breakSoon  = breakIn != null && breakIn > 0 && breakIn <= 0.5;

  return (
    <div>
      {/* Three main clocks */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Clock
          label={t('driving_time')}
          hours={hos?.driving_remaining}
        />
        <Clock
          label={t('shift_time')}
          hours={hos?.shift_remaining}
        />
        <Clock
          label={t('cycle_time')}
          hours={hos?.cycle_remaining}
        />
      </div>

      {/* Break alert */}
      {(needsBreak || breakSoon) && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          borderRadius: 8,
          background: needsBreak ? '#7f1d1d' : '#78350f',
          border: `1px solid ${needsBreak ? '#ef4444' : '#f97316'}`,
          color: needsBreak ? '#fca5a5' : '#fdba74',
          fontSize: 13,
          textAlign: 'center',
        }}>
          {needsBreak
            ? '⚠ 30-minute break required now'
            : `⚠ ${t('break_needed')} ${formatTime(breakIn)}`}
        </div>
      )}

      {/* Violation badges */}
      {hos?.has_violation && (
        <div style={{
          marginTop: 8,
          padding: '6px 12px',
          borderRadius: 8,
          background: '#450a0a',
          border: '1px solid #ef4444',
          color: '#fca5a5',
          fontSize: 12,
          textAlign: 'center',
        }}>
          🚨 {hos.violations?.filter(v => v.severity === 'violation').length} HOS violation(s) active
        </div>
      )}
    </div>
  );
}
