/**
 * C:\Users\RegenU3\eld-app\frontend-driver\src\pages\DashboardPage.jsx
 *
 * v2 — Cybernetic redesign
 *   • HOSHero как главный визуальный акцент
 *   • HOSClocks переехали внутрь HOSHero (compact rings)
 *   • Статус-переключатель с glow-эффектом
 */

import { useTranslation } from 'react-i18next';
import { useNavigate }    from 'react-router-dom';
import { useAuth }        from '../store/AuthContext';
import { useHOS }         from '../store/HOSContext';
import HOSHero            from '../components/hos/HOSHero';
import HOSClocks          from '../components/hos/HOSClocks';
import StatusChangePanel  from '../components/hos/StatusChangePanel';
import OBDPanel           from '../components/obd/OBDPanel';

const STATUS_COLORS = {
  OFF: 'var(--status-off)',
  SB:  'var(--status-sb)',
  D:   'var(--status-driving)',
  ON:  'var(--status-on)',
};

const STATUS_LABELS = {
  OFF: 'OFF DUTY',
  SB:  'SLEEPER',
  D:   'DRIVING',
  ON:  'ON DUTY',
};

const QUICK_ACTIONS = [
  { icon: '📋', labelKey: 'logbook',      path: '/logbook'    },
  { icon: '🔧', labelKey: 'dvir',          path: '/dvir'       },
  { icon: '📡', labelKey: 'dot_transfer',  path: '/transfer'   },
  { icon: '⚠️', labelKey: 'violations',    path: '/violations' },
];

export default function DashboardPage() {
  const { t }                                             = useTranslation();
  const { user, driver, logout }                          = useAuth();
  const { hos, session, loading, isOnline, pendingCount } = useHOS();
  const navigate                                          = useNavigate();

  const currentStatus = driver?.current_status || 'OFF';
  const statusColor   = STATUS_COLORS[currentStatus] || 'var(--status-off)';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface-dim)',
      color: 'var(--on-surface)',
      maxWidth: 480,
      margin: '0 auto',
      paddingBottom: 80,
      fontFamily: 'var(--font-body)',
    }}>

      {/* ── Header ── */}
      <header style={{
        padding: 'var(--sp-4)',
        background: 'var(--surface-low)',
        borderBottom: '1px solid var(--outline)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            borderRadius: 'var(--r-md)',
            background: 'var(--primary-glow)',
            border: '1px solid var(--outline-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>
            🚛
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--on-surface)',
            }}>
              {user?.first_name} {user?.last_name}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--on-surface-dim)',
              letterSpacing: '0.06em',
            }}>
              {session?.session_date || 'NO SESSION'}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          padding: '5px 14px',
          borderRadius: 'var(--r-full)',
          background: `${statusColor}18`,
          border: `1px solid ${statusColor}`,
          color: statusColor,
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.08em',
          boxShadow: currentStatus === 'D'
            ? `0 0 12px ${statusColor}40`
            : 'none',
        }}>
          {STATUS_LABELS[currentStatus]}
        </div>
      </header>

      <div style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

        {/* ── Connectivity banners ── */}
        {!isOnline && (
          <div style={{
            padding: 'var(--sp-2) var(--sp-3)',
            background: 'rgba(249,115,22,0.08)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--r-md)',
            color: 'var(--warning)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>⬡ OFFLINE — EVENTS QUEUED LOCALLY</span>
            {pendingCount > 0 && <span style={{ fontWeight: 700 }}>{pendingCount} PENDING</span>}
          </div>
        )}
        {isOnline && pendingCount > 0 && (
          <div style={{
            padding: 'var(--sp-2) var(--sp-3)',
            background: 'var(--ok-glow)',
            border: '1px solid var(--ok)',
            borderRadius: 'var(--r-md)',
            color: 'var(--ok)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}>
            ✓ BACK ONLINE — SYNCING {pendingCount} EVENT(S)...
          </div>
        )}

        {/* ── HOSHero — главный циферблат ── */}
        <section>
          {loading && !hos ? (
            <div style={{
              height: 300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--on-surface-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.08em',
            }}>
              LOADING HOS DATA...
            </div>
          ) : (
            <HOSHero hos={hos} currentStatus={currentStatus} />
          )}
        </section>

        {/* ── Compact rings (детали) ── */}
        {hos && (
          <section>
            <HOSClocks hos={hos} />
          </section>
        )}

        {/* ── Status Change ── */}
        <section>
          <SectionLabel>DUTY STATUS</SectionLabel>
          <StatusChangePanel currentStatus={currentStatus} />
        </section>

        {/* ── OBD / ECM Panel ── */}
        <section>
          <SectionLabel>ENGINE DATA</SectionLabel>
          <OBDPanel />
        </section>

        {/* ── Quick Actions ── */}
        <section>
          <SectionLabel>QUICK ACCESS</SectionLabel>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--sp-2)',
          }}>
            {QUICK_ACTIONS.map(({ icon, labelKey, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  padding: 'var(--sp-4) var(--sp-3)',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: 'var(--r-lg)',
                  color: 'var(--on-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                  transition: 'border-color var(--ease-fast), background var(--ease-fast)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--outline-primary)';
                  e.currentTarget.style.background   = 'rgba(0,229,255,0.04)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--card-border)';
                  e.currentTarget.style.background   = 'var(--card-bg)';
                }}
              >
                <span style={{ fontSize: 22 }}>{icon}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--on-surface-muted)',
                }}>
                  {t(labelKey)}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Logout ── */}
        <button
          onClick={logout}
          style={{
            width: '100%',
            padding: 'var(--sp-3)',
            background: 'transparent',
            border: '1px solid var(--outline)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--on-surface-dim)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            transition: 'border-color var(--ease-fast)',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--danger)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--outline)'}
        >
          {t('logout')}
        </button>

      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      fontWeight: 600,
      color: 'var(--on-surface-dim)',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      marginBottom: 'var(--sp-2)',
    }}>
      {children}
    </div>
  );
}
