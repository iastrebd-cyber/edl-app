/**
 * src/pages/DashboardPage.jsx
 *
 * Main screen the driver sees after login:
 *   - Current status indicator
 *   - Three HOS clocks
 *   - Status change panel
 *   - Quick links to Logbook, DVIR, DOT Transfer
 */

import { useTranslation } from 'react-i18next';
import { useNavigate }    from 'react-router-dom';
import { useAuth }        from '../store/AuthContext';
import { useHOS }         from '../store/HOSContext';
import HOSClocks          from '../components/hos/HOSClocks';
import StatusChangePanel  from '../components/hos/StatusChangePanel';

const STATUS_LABELS = {
  OFF: 'Off Duty',
  SB:  'Sleeper Berth',
  D:   'Driving',
  ON:  'On Duty',
};

const STATUS_COLORS = {
  OFF: '#64748b',
  SB:  '#6366f1',
  D:   '#22c55e',
  ON:  '#f59e0b',
};

export default function DashboardPage() {
  const { t }                        = useTranslation();
  const { user, driver, logout }     = useAuth();
  const { hos, session, loading, isOnline, pendingCount } = useHOS();
  const navigate                     = useNavigate();

  const currentStatus = driver?.current_status || 'OFF';
  const statusColor   = STATUS_COLORS[currentStatus] || '#64748b';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#f1f5f9',
      maxWidth: 480,
      margin: '0 auto',
      padding: '0 0 80px',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {user?.first_name} {user?.last_name}
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>
            {session?.session_date || 'No session'}
          </div>
        </div>

        {/* Current status badge */}
        <div style={{
          padding: '6px 14px',
          borderRadius: 20,
          background: statusColor + '22',
          border: `1px solid ${statusColor}`,
          color: statusColor,
          fontWeight: 700,
          fontSize: 14,
        }}>
          {STATUS_LABELS[currentStatus]}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Offline banner */}
        {!isOnline && (
          <div style={{
            padding: '8px 12px', marginBottom: 12,
            background: '#78350f', border: '1px solid #f59e0b',
            borderRadius: 8, color: '#fde68a', fontSize: 13,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>📵 Offline — events queued locally</span>
            {pendingCount > 0 && (
              <span style={{ fontWeight: 700 }}>{pendingCount} pending</span>
            )}
          </div>
        )}
        {isOnline && pendingCount > 0 && (
          <div style={{
            padding: '8px 12px', marginBottom: 12,
            background: '#052e16', border: '1px solid #22c55e',
            borderRadius: 8, color: '#86efac', fontSize: 13,
          }}>
            ✓ Back online — syncing {pendingCount} event(s)...
          </div>
        )}
        {/* HOS Clocks */}
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 10 }}>
            Hours of Service
          </h2>
          {loading && !hos ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>
              {t('loading')}
            </div>
          ) : (
            <HOSClocks hos={hos} />
          )}
        </section>

        {/* Status change */}
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 10 }}>
            {t('change_status')}
          </h2>
          <StatusChangePanel currentStatus={currentStatus} />
        </section>

        {/* Quick nav */}
        <section>
          <h2 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 10 }}>
            Quick Actions
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { icon: '📋', label: t('logbook'),    path: '/logbook'  },
              { icon: '🔧', label: t('dvir'),        path: '/dvir'     },
              { icon: '📡', label: t('dot_transfer'), path: '/transfer' },
              { icon: '⚠️', label: t('violations'),  path: '/violations'},
            ].map(({ icon, label, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  padding: '16px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 22 }}>{icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            marginTop: 24, width: '100%', padding: '12px 0',
            background: 'transparent', border: '1px solid #334155',
            borderRadius: 10, color: '#64748b', cursor: 'pointer', fontSize: 14,
          }}
        >
          {t('logout')}
        </button>
      </div>
    </div>
  );
}

// Note: offline indicator is rendered inside the existing component
// The useHOS hook now provides isOnline and pendingCount
