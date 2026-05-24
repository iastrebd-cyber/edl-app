/**
 * src/components/hos/StatusChangePanel.jsx
 *
 * Four duty status buttons: OFF / SB / D / ON
 * + PC and YM annotation toggles
 * + Geolocation capture on status change
 * + Confirmation dialog before submitting
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate }    from 'react-router-dom';
import { useHOS }         from '../../store/HOSContext';

const STATUSES = [
  { code: '1', key: 'off_duty',      label: 'OFF', color: '#64748b', bg: '#1e293b' },
  { code: '2', key: 'sleeper_berth', label: 'SB',  color: '#6366f1', bg: '#1e1b4b' },
  { code: '3', key: 'driving',       label: 'D',   color: '#22c55e', bg: '#052e16' },
  { code: '4', key: 'on_duty',       label: 'ON',  color: '#f59e0b', bg: '#1c1917' },
];

const CURRENT_STATUS_MAP = {
  'OFF': '1', 'SB': '2', 'D': '3', 'ON': '4',
};

export default function StatusChangePanel({ currentStatus }) {
  const { t }          = useTranslation();
  const navigate       = useNavigate();
  const { changeStatus, refreshHOS, pretripStatus, checkPretrip, session } = useHOS();

  const [pending,    setPending]    = useState(null);   // status being confirmed
  const [isPC,       setIsPC]       = useState(false);
  const [isYM,       setIsYM]       = useState(false);
  const [annotation, setAnnotation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const currentCode = CURRENT_STATUS_MAP[currentStatus] || '1';

  const handleSelect = (status) => {
    if (status.code === currentCode) return; // already this status
    // Reset annotations when selecting new status
    setIsPC(false);
    setIsYM(false);
    setAnnotation('');
    setError(null);
    setPending(status);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);

    try {
      /* ── Pre-trip DVIR gate (FMCSA §396.11) ──────────────────────────
       * Switching to Driving (code 3) requires a completed pre-trip DVIR.
       * We re-fetch the status here in case it was completed after page load.
       */
      if (pending.code === '3') {
        let status = pretripStatus;
        // Re-check if not yet loaded or if session just started
        if (!status) {
          status = await checkPretrip(session?.id);
        }

        if (status && !status.completed) {
          setError('Pre-trip inspection required before driving (FMCSA §396.11).');
          setSubmitting(false);
          return;
        }

        if (status?.completed && status.safe_to_operate === false) {
          setError('Vehicle marked OUT OF SERVICE in pre-trip DVIR. Cannot start driving.');
          setSubmitting(false);
          return;
        }
      }

      // Get GPS location
      let lat = null, lon = null;
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch { /* GPS unavailable — allowed by FMCSA */ }

      // Determine special condition
      let specialCondition = null;
      if (pending.code === '1' && isPC) specialCondition = 'personal_conveyance';
      if (pending.code === '4' && isYM) specialCondition = 'yard_move';

      await changeStatus({
        eventCode:        pending.code,
        specialCondition,
        annotation:       annotation.trim() || null,
        latitude:         lat,
        longitude:        lon,
      });

      setPending(null);
      setAnnotation('');
      setIsPC(false);
      setIsYM(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Status buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {STATUSES.map((s) => {
          const isActive  = s.code === currentCode;
          const isPending = pending?.code === s.code;

          return (
            <button
              key={s.code}
              onClick={() => handleSelect(s)}
              style={{
                padding: '14px 4px',
                borderRadius: 10,
                border: `2px solid ${isActive || isPending ? s.color : '#334155'}`,
                background: isActive ? s.bg : isPending ? s.bg : '#0f172a',
                color: isActive || isPending ? s.color : '#64748b',
                fontWeight: 700,
                fontSize: 15,
                cursor: isActive ? 'default' : 'pointer',
                transition: 'all 0.15s',
                opacity: isActive ? 1 : 0.85,
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 2 }}>
                {isActive ? '●' : '○'}
              </div>
              {s.label}
              <div style={{ fontSize: 10, marginTop: 2, fontWeight: 400 }}>
                {t(s.key)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirmation panel */}
      {pending && (
        <div style={{
          marginTop: 12,
          padding: 14,
          background: '#0f172a',
          border: `1px solid ${pending.color}`,
          borderRadius: 12,
        }}>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10 }}>
            Changing status to{' '}
            <span style={{ color: pending.color, fontWeight: 700 }}>
              {pending.label} — {t(pending.key)}
            </span>
          </div>

          {/* ── Pre-trip DVIR warning (shown only for DRIVING) ── */}
          {pending.code === '3' && pretripStatus !== null && !pretripStatus.completed && (
            <div style={{
              padding: '10px 12px',
              marginBottom: 10,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              fontSize: 12,
              color: '#fca5a5',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                ⚠ Pre-trip inspection not completed
              </div>
              <div style={{ marginBottom: 8, lineHeight: 1.4 }}>
                FMCSA §396.11 requires a pre-trip DVIR before each trip.
              </div>
              <button
                onClick={() => navigate('/dvir')}
                style={{
                  padding: '6px 14px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Complete Pre-Trip DVIR →
              </button>
            </div>
          )}

          {/* ── Out-of-service vehicle warning ── */}
          {pending.code === '3' && pretripStatus?.completed && pretripStatus.safe_to_operate === false && (
            <div style={{
              padding: '10px 12px',
              marginBottom: 10,
              background: 'rgba(239,68,68,0.12)',
              border: '2px solid #ef4444',
              borderRadius: 8,
              fontSize: 12,
              color: '#fca5a5',
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                🚫 Vehicle is OUT OF SERVICE
              </div>
              <div>Pre-trip DVIR marked vehicle unsafe to operate.</div>
            </div>
          )}

          {/* PC toggle (only for OFF) */}
          {pending.code === '1' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8,
              color: '#94a3b8', fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={isPC}
                onChange={e => setIsPC(e.target.checked)} />
              {t('personal_conveyance')}
            </label>
          )}

          {/* YM toggle (only for ON) */}
          {pending.code === '4' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8,
              color: '#94a3b8', fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={isYM}
                onChange={e => setIsYM(e.target.checked)} />
              {t('yard_move')}
            </label>
          )}

          {/* Optional annotation */}
          <input
            type="text"
            placeholder={t('note')}
            value={annotation}
            onChange={e => setAnnotation(e.target.value)}
            maxLength={120}
            style={{
              width: '100%', padding: '8px 10px',
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 8, color: '#e2e8f0', fontSize: 13,
              marginBottom: 10, boxSizing: 'border-box',
            }}
          />

          {error && (
            <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPending(null)}
              disabled={submitting}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: '1px solid #334155', background: 'transparent',
                color: '#64748b', cursor: 'pointer', fontSize: 14,
              }}>
              {t('cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 8,
                border: 'none', background: pending.color,
                color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14,
              }}>
              {submitting ? '...' : t('confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
