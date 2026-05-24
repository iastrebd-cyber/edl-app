/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\FleetStatsBar.jsx
 *
 * Sticky bottom bar с агрегатными метриками флота.
 * Вдохновлён Stitch Live Tracking экраном (ACTIVE_FLEET / ON_DUTY / ALERTS).
 */

export default function FleetStatsBar({ drivers, alerts = [] }) {
  const list       = Object.values(drivers || {});
  const active     = list.length;
  const onDuty     = list.filter(d => d.hosStatus === 'D' || d.hosStatus === 'ON').length;
  const violations = list.filter(d => d.hosViolation || (d.hosRemaining != null && d.hosRemaining <= 0)).length;
  const alertCount = (alerts || []).filter(a => {
    const lvl = a.level || (a.type === 'offline' ? 'critical' : a.type === 'hos' ? 'warning' : 'info');
    return lvl === 'critical' || lvl === 'warning';
  }).length;

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-4)',
      padding: 'var(--sp-3) var(--sp-6)',
      background: 'rgba(12,16,25,0.85)',
      border: '1px solid var(--outline)',
      borderRadius: 'var(--r-full)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
      zIndex: 10,
    }}>
      <StatItem
        label="ACTIVE_FLEET"
        value={active}
        color="var(--on-surface)"
      />
      <Divider />
      <StatItem
        label="ON_DUTY"
        value={onDuty}
        color="var(--primary)"
      />
      <Divider />
      <StatItem
        label={violations > 0 ? 'VIOLATIONS' : 'ALERTS'}
        value={violations > 0 ? violations : alertCount}
        color={violations > 0 ? 'var(--danger)' : alertCount > 0 ? 'var(--warning)' : 'var(--on-surface-dim)'}
        glow={violations > 0}
      />
    </div>
  );
}

function StatItem({ label, value, color, glow }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--on-surface-dim)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 22,
        fontWeight: 700,
        color,
        lineHeight: 1,
        textShadow: glow ? `0 0 12px ${color}` : 'none',
      }}>
        {String(value).padStart(2, '0')}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width: 1,
      height: 32,
      background: 'var(--outline)',
      flexShrink: 0,
    }} />
  );
}
