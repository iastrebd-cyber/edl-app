/**
 * src/components/hos/HOSClocks.jsx
 *
 * Upgrade v2 — Cybernetic Glassmorphism style
 *   • Glow при приближении к лимиту
 *   • BREAK IN как 4-е отдельное кольцо
 *   • Пульсация при danger-состоянии
 *   • Space Grotesk + Geist Mono типографика
 */

import { useTranslation } from 'react-i18next';

function formatTime(hours) {
  if (hours == null || isNaN(hours)) return '--:--';
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getColorVar(hours, isDanger = false) {
  if (isDanger || hours == null || hours <= 0) return 'var(--danger)';
  if (hours <= 1)  return 'var(--warning)';
  if (hours <= 2)  return 'var(--caution)';
  return 'var(--primary)';
}

function getGlowVar(hours, isDanger = false) {
  if (isDanger || hours == null || hours <= 0) return 'var(--danger-glow)';
  if (hours <= 1)  return 'var(--warning-glow)';
  if (hours <= 2)  return 'var(--caution-glow)';
  return 'var(--primary-glow)';
}

/**
 * Одно кольцо.
 * maxHours — максимум для заполнения (11 для driving, 14 для shift, etc.)
 */
function Ring({ label, hours, maxHours = 14, isDanger = false, size = 88 }) {
  const color    = getColorVar(hours, isDanger);
  const glow     = getGlowVar(hours, isDanger);
  const R        = (size - 14) / 2;            // радиус, с учётом stroke
  const circ     = 2 * Math.PI * R;
  const ratio    = Math.min(1, Math.max(0, (hours || 0) / maxHours));
  const offset   = circ * (1 - ratio);
  const isPulse  = hours != null && hours <= 1;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    }}>
      {/* Кольцо */}
      <div style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        ...(isPulse ? {
          animation: isDanger
            ? 'sonar-danger 1.4s ease-out infinite'
            : 'sonar 1.4s ease-out infinite',
        } : {}),
      }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Фоновый трек */}
          <circle
            cx={size / 2} cy={size / 2} r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={8}
          />
          {/* Активная дуга */}
          <circle
            cx={size / 2} cy={size / 2} r={R}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: 'stroke-dashoffset var(--ease-slow), stroke var(--ease-mid)',
              filter: `drop-shadow(0 0 6px ${color})`,
            }}
          />
          {/* Цифры */}
          <text
            x={size / 2} y={size / 2 + 5}
            textAnchor="middle"
            fill={color}
            fontSize={size < 80 ? 13 : 15}
            fontWeight="700"
            fontFamily="'Geist Mono', monospace"
            style={{ letterSpacing: '-0.02em' }}
          >
            {formatTime(hours)}
          </text>
        </svg>
      </div>

      {/* Лейбл */}
      <span style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--on-surface-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        textAlign: 'center',
        lineHeight: 1.2,
      }}>
        {label}
      </span>
    </div>
  );
}

export default function HOSClocks({ hos }) {
  const { t } = useTranslation();

  const breakIn    = hos?.break_needed_in;
  const needsBreak = breakIn != null && breakIn <= 0;
  const breakSoon  = breakIn != null && breakIn > 0 && breakIn <= 0.5;

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderTopColor: 'var(--outline-primary)',
      borderRadius: 'var(--r-lg)',
      padding: 'var(--sp-4)',
    }}>
      {/* Заголовок секции */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--primary)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: 'var(--sp-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--primary)',
          display: 'inline-block',
          boxShadow: '0 0 6px var(--primary)',
          animation: 'sonar 2s ease-out infinite',
        }} />
        CYCLE COUNTERS
      </div>

      {/* 4 кольца */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Ring
          label={`DRIVING\nREM`}
          hours={hos?.driving_remaining}
          maxHours={11}
        />
        <Ring
          label={`SHIFT\nREM`}
          hours={hos?.shift_remaining}
          maxHours={14}
        />
        <Ring
          label={`CYCLE\nREM`}
          hours={hos?.cycle_remaining}
          maxHours={70}
        />
        <Ring
          label={`BREAK\nIN`}
          hours={breakIn}
          maxHours={8}
          isDanger={needsBreak}
          size={80}
        />
      </div>

      {/* Break alert */}
      {(needsBreak || breakSoon) && (
        <div style={{
          marginTop: 'var(--sp-3)',
          padding: 'var(--sp-2) var(--sp-3)',
          borderRadius: 'var(--r-md)',
          background: needsBreak
            ? 'rgba(239,68,68,0.10)'
            : 'rgba(249,115,22,0.10)',
          border: `1px solid ${needsBreak ? 'var(--danger)' : 'var(--warning)'}`,
          color: needsBreak ? 'var(--danger)' : 'var(--warning)',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          textAlign: 'center',
          letterSpacing: '0.04em',
        }}>
          {needsBreak
            ? '⚠ 30-MIN BREAK REQUIRED NOW'
            : `⚠ BREAK IN ${formatTime(breakIn)}`}
        </div>
      )}

      {/* Violation */}
      {hos?.has_violation && (
        <div style={{
          marginTop: 'var(--sp-2)',
          padding: 'var(--sp-2) var(--sp-3)',
          borderRadius: 'var(--r-md)',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          textAlign: 'center',
          letterSpacing: '0.04em',
          boxShadow: '0 0 12px var(--danger-glow)',
        }}>
          🚨 {hos.violations?.filter(v => v.severity === 'violation').length} HOS VIOLATION(S) ACTIVE
        </div>
      )}
    </div>
  );
}
