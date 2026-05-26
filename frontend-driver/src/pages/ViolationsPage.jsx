/**
 * src/pages/ViolationsPage.jsx
 *
 * Driver HOS violations list.
 * Fetches from GET /violations/driver/:id via violationsAPI.
 *
 * Severity levels: critical (red), warning (orange), advisory (yellow)
 * Shows open violations first, resolved below.
 */

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useTranslation }      from 'react-i18next';
import { useAuth }             from '../store/AuthContext';
import { violationsAPI }       from '../api/client';

/* ── Severity style map ────────────────────────────────────────── */
const SEV = {
  critical: {
    bar:  '#ef4444',
    border: 'rgba(239,68,68,0.4)',
    bg:   'rgba(239,68,68,0.07)',
    pill: { bg: '#450a0a', color: '#fca5a5' },
  },
  warning: {
    bar:  '#f97316',
    border: 'rgba(249,115,22,0.4)',
    bg:   'rgba(249,115,22,0.07)',
    pill: { bg: '#431407', color: '#fdba74' },
  },
  advisory: {
    bar:  '#eab308',
    border: 'rgba(234,179,8,0.4)',
    bg:   'rgba(234,179,8,0.06)',
    pill: { bg: '#422006', color: '#fde047' },
  },
};

function formatType(type) {
  return (type || '').replace(/_/g, ' ').toUpperCase();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Single violation card ─────────────────────────────────────── */
function ViolationCard({ v }) {
  const sev = SEV[v.severity] || SEV.advisory;

  return (
    <div style={{
      display: 'flex',
      background: sev.bg,
      border: `1px solid ${sev.border}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Left colour bar */}
      <div style={{ width: 4, flexShrink: 0, background: sev.bar }} />

      <div style={{ flex: 1, padding: '12px 14px' }}>
        {/* Type + badges */}
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 8, marginBottom: 6,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0', flex: 1 }}>
            {formatType(v.violation_type)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: sev.pill.bg, color: sev.pill.color,
              padding: '2px 8px', borderRadius: 20,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {v.severity}
            </span>
            {v.is_resolved && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: '#052e16', color: '#22c55e',
                padding: '2px 8px', borderRadius: 20,
                letterSpacing: '0.04em',
              }}>
                ✓ Resolved
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {v.description && (
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>
            {v.description}
          </div>
        )}

        {/* Timestamps */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            🕐 {formatDate(v.occurred_at)}
          </span>
          {v.is_resolved && v.resolved_at && (
            <span style={{ fontSize: 11, color: '#22c55e88' }}>
              ✓ {formatDate(v.resolved_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function ViolationsPage() {
  const { t }        = useTranslation();
  const navigate     = useNavigate();
  const { driver }   = useAuth();

  const [violations, setViolations] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    if (!driver?.id) return;
    violationsAPI.getDriverViolations(driver.id)
      .then(({ data }) => setViolations(data.violations || []))
      .catch(err => setError(err.response?.data?.message || 'Failed to load violations'))
      .finally(() => setLoading(false));
  }, [driver?.id]);

  const open     = violations.filter(v => !v.is_resolved);
  const resolved = violations.filter(v =>  v.is_resolved);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#f1f5f9',
      maxWidth: 480,
      margin: '0 auto',
      paddingBottom: 40,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: '#64748b',
            fontSize: 20, cursor: 'pointer', padding: 0 }}
        >
          ←
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>
          ⚠️ {t('violations')}
        </h1>
        {!loading && !error && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color:       open.length > 0 ? '#fca5a5'  : '#22c55e',
            background:  open.length > 0 ? '#450a0a'  : '#052e16',
            border:      `1px solid ${open.length > 0 ? '#ef4444' : '#22c55e'}`,
            padding: '3px 8px', borderRadius: 20,
          }}>
            {open.length > 0 ? `${open.length} OPEN` : '✓ CLEAR'}
          </span>
        )}
      </div>

      <div style={{ padding: 16 }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', color: '#475569', padding: 40 }}>
            {t('loading')}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: '#ef4444', fontSize: 13, marginBottom: 12,
          }}>
            ❌ {error}
          </div>
        )}

        {/* Empty — all compliant */}
        {!loading && !error && violations.length === 0 && (
          <div style={{
            textAlign: 'center', padding: 48,
            background: '#1e293b', borderRadius: 12,
            border: '1px solid #22c55e44',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              No violations recorded
            </div>
            <div style={{ color: '#64748b', fontSize: 13 }}>
              Your HOS log is in compliance.
            </div>
          </div>
        )}

        {/* Open violations */}
        {open.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#64748b',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Open ({open.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {open.map(v => <ViolationCard key={v.id} v={v} />)}
            </div>
          </div>
        )}

        {/* Resolved violations */}
        {resolved.length > 0 && (
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#64748b',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Resolved ({resolved.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {resolved.map(v => <ViolationCard key={v.id} v={v} />)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
