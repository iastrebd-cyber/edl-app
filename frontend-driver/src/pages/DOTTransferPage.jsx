/**
 * src/pages/DOTTransferPage.jsx
 *
 * 2.7 — DOT Data Transfer
 * Allows driver to transmit ELD records to a DOT/FMCSA inspector via:
 *   1. HTTPS  — submit to FMCSA web services portal
 *   2. Email  — send encrypted file to inspector's email
 *   3. Local  — generate and download the ELD output file
 *
 * FMCSA ELD Mandate reference: 49 CFR Part 395, Subpart B
 * Output file format: ELD Standard (FMCSA §395.26)
 */

import { useState, useRef } from 'react';
import { useNavigate }      from 'react-router-dom';
import { useTranslation }   from 'react-i18next';
import { useAuth }          from '../store/AuthContext';
import { useHOS }           from '../store/HOSContext';
import api                  from '../api/client';

/* ─── colour palette (matches rest of app) ─────────────────────────── */
const C = {
  bg:        '#0f172a',
  surface:   '#1e293b',
  border:    '#334155',
  muted:     '#64748b',
  text:      '#f1f5f9',
  subtext:   '#94a3b8',
  blue:      '#3b82f6',
  blueHover: '#2563eb',
  green:     '#22c55e',
  amber:     '#f59e0b',
  red:       '#ef4444',
};

/* ─── transfer methods ──────────────────────────────────────────────── */
const METHODS = [
  {
    id:    'https',
    icon:  '🌐',
    label: 'FMCSA Web Portal',
    desc:  'Transmit directly to eRODS / FMCSA secure server (recommended)',
    badge: 'FMCSA §395.26(b)(1)',
  },
  {
    id:    'email',
    icon:  '📧',
    label: 'Email to Inspector',
    desc:  'Send encrypted ELD file to inspector\'s provided email address',
    badge: 'FMCSA §395.26(b)(2)',
  },
  {
    id:    'local',
    icon:  '📥',
    label: 'Local Download',
    desc:  'Download ELD output file to this device for manual transfer',
    badge: 'FMCSA §395.26(b)(3)',
  },
];

/* ─── small UI helpers ──────────────────────────────────────────────── */
function Row({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between',
      padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ color: C.muted, fontSize: 13 }}>{label}</span>
      <span style={{ color: C.text,  fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    idle:       { bg: '#1e293b', color: C.muted,  label: 'Ready'       },
    loading:    { bg: '#1e3a5f', color: C.blue,   label: 'Sending…'    },
    success:    { bg: '#14532d', color: C.green,  label: 'Transmitted' },
    error:      { bg: '#450a0a', color: C.red,    label: 'Failed'      },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11,
      fontWeight: 700, background: s.bg, color: s.color,
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      {s.label}
    </span>
  );
}

/* ─── main component ────────────────────────────────────────────────── */
export default function DOTTransferPage() {
  const { t }        = useTranslation();
  const navigate     = useNavigate();
  const { driver }   = useAuth();
  const { session }  = useHOS();

  /* form state */
  const [method,       setMethod]       = useState('https');
  const [inspEmail,    setInspEmail]    = useState('');
  const [dateFrom,     setDateFrom]     = useState(todayMinus(7));
  const [dateTo,       setDateTo]       = useState(today());
  const [outputCode,   setOutputCode]   = useState('');   // inspector output file code
  const [comment,      setComment]      = useState('');

  /* submission state */
  const [status,   setStatus]   = useState('idle'); // idle | loading | success | error
  const [errMsg,   setErrMsg]   = useState('');
  const [response, setResponse] = useState(null);

  /* ── submit ───────────────────────────────────────────────────────── */
  const handleTransfer = async () => {
    setStatus('loading');
    setErrMsg('');

    try {
      /* 1. Gather GPS (best effort) */
      let lat = null, lon = null;
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch {}

      /* 2. Build payload */
      const payload = {
        method,
        session_id:    session?.id     || null,
        date_from:     dateFrom,
        date_to:       dateTo,
        output_code:   outputCode      || undefined,
        inspector_email: method === 'email' ? inspEmail : undefined,
        comment:       comment         || undefined,
        latitude:      lat,
        longitude:     lon,
      };

      /* 3. Call backend */
      const { data } = await api.post('/dot-transfer', payload);

      /* 4. Local download — create blob from base64 if backend returns file */
      if (method === 'local' && data?.file_base64) {
        const bytes = Uint8Array.from(atob(data.file_base64), c => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: 'application/octet-stream' });
        const url   = URL.createObjectURL(blob);
        const a     = document.createElement('a');
        a.href      = url;
        a.download  = data.filename || 'eld_output.elds';
        a.click();
        URL.revokeObjectURL(url);
      }

      setResponse(data);
      setStatus('success');
    } catch (err) {
      setErrMsg(
        err?.response?.data?.message ||
        err?.message ||
        'Transfer failed. Please try again.'
      );
      setStatus('error');
    }
  };

  /* ── success screen ───────────────────────────────────────────────── */
  if (status === 'success') {
    return (
      <div style={pageWrap}>
        <div style={{
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          flex:1, padding:24, textAlign:'center',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Transfer Complete
          </h2>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 8, maxWidth: 320 }}>
            {method === 'https' && 'ELD records transmitted to FMCSA eRODS portal.'}
            {method === 'email' && `ELD file sent to ${inspEmail}.`}
            {method === 'local' && 'ELD output file downloaded to your device.'}
          </p>

          {/* Confirmation code from server */}
          {response?.confirmation_code && (
            <div style={{
              margin: '20px 0', padding: '14px 24px',
              background: C.surface, borderRadius: 10,
              border: `1px solid ${C.green}`,
            }}>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 4,
                textTransform:'uppercase', letterSpacing:'0.08em' }}>
                Confirmation Code
              </div>
              <div style={{ color: C.green, fontSize: 22, fontWeight: 700,
                letterSpacing: '0.12em' }}>
                {response.confirmation_code}
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                Show this to the inspector
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:12, marginTop: 16 }}>
            <button onClick={() => { setStatus('idle'); setResponse(null); }}
              style={btnOutline}>
              New Transfer
            </button>
            <button onClick={() => navigate('/')} style={btnPrimary}>
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── main form ────────────────────────────────────────────────────── */
  return (
    <div style={pageWrap}>

      {/* ── Header ── */}
      <div style={{
        padding: '14px 16px',
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <button onClick={() => navigate('/')}
          style={{ background:'none', border:'none', color: C.muted,
            fontSize: 20, cursor:'pointer', padding: 0 }}>
          ←
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>
          DOT Data Transfer
        </h1>
        <StatusBadge status={status} />
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ padding: 16, overflowY:'auto', flex: 1 }}>

        {/* ── Driver / session info ── */}
        <div style={card}>
          <div style={cardTitle}>Driver & Session</div>
          <Row label="Driver"     value={driver?.name   || driver?.email || '—'} />
          <Row label="CDL / ID"   value={driver?.cdl    || '—'} />
          <Row label="Carrier"    value={driver?.carrier || '—'} />
          <Row label="Session ID" value={session?.id    || 'No active session'} />
        </div>

        {/* ── Date range ── */}
        <div style={card}>
          <div style={cardTitle}>Date Range</div>
          <p style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
            Select the ELD log period to transmit (max 8 days per FMCSA rule).
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
            <label style={labelStyle}>
              <span style={{ color: C.muted, fontSize: 12 }}>From</span>
              <input
                type="date" value={dateFrom} max={dateTo}
                onChange={e => setDateFrom(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={{ color: C.muted, fontSize: 12 }}>To</span>
              <input
                type="date" value={dateTo} min={dateFrom} max={today()}
                onChange={e => setDateTo(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>
        </div>

        {/* ── Transfer method ── */}
        <div style={card}>
          <div style={cardTitle}>Transfer Method</div>
          <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
            {METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                style={{
                  display:'flex', alignItems:'flex-start', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  border: `2px solid ${method === m.id ? C.blue : C.border}`,
                  background: method === m.id ? 'rgba(59,130,246,0.08)' : C.surface,
                  cursor:'pointer', textAlign:'left', width:'100%',
                  transition: 'border-color 0.15s, background 0.15s',
                }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>
                      {m.label}
                    </span>
                    <span style={{
                      fontSize: 9, color: C.muted,
                      border: `1px solid ${C.border}`, borderRadius: 4,
                      padding: '1px 5px', letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      {m.badge}
                    </span>
                  </div>
                  <span style={{ color: C.muted, fontSize: 12 }}>{m.desc}</span>
                </div>
                {method === m.id && (
                  <span style={{ color: C.blue, fontSize: 16, flexShrink: 0 }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Method-specific fields ── */}
        {method === 'https' && (
          <div style={card}>
            <div style={cardTitle}>Inspector Output File Code</div>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
              Optional: enter the 4-digit code provided by the inspector
              to include it in the transmitted file (FMCSA §395.26(c)).
            </p>
            <input
              type="text"
              placeholder="e.g. 1234"
              maxLength={8}
              value={outputCode}
              onChange={e => setOutputCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...inputStyle, letterSpacing:'0.15em', fontSize: 18,
                fontWeight: 700, textAlign:'center' }}
            />
          </div>
        )}

        {method === 'email' && (
          <div style={card}>
            <div style={cardTitle}>Inspector Email Address</div>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
              Enter the email address provided by the DOT/FMCSA inspector.
            </p>
            <input
              type="email"
              placeholder="inspector@dot.gov"
              value={inspEmail}
              onChange={e => setInspEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {method === 'local' && (
          <div style={{
            ...card,
            background: 'rgba(245,158,11,0.07)',
            border: `1px solid rgba(245,158,11,0.3)`,
          }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ color: C.amber, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  Manual Transfer Required
                </div>
                <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>
                  The ELD output file (.elds) will be downloaded to this device.
                  You must then transfer it to the inspector's device via USB
                  or Bluetooth as required by FMCSA §395.26(b)(3).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Optional comment ── */}
        <div style={card}>
          <div style={cardTitle}>Comment <span style={{ color: C.muted, fontWeight:400 }}>(optional)</span></div>
          <textarea
            rows={3}
            placeholder="Any notes for the inspector…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 72,
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* ── Error banner ── */}
        {status === 'error' && (
          <div style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 12,
            background: 'rgba(239,68,68,0.1)',
            border: `1px solid rgba(239,68,68,0.35)`,
            color: C.red, fontSize: 13,
          }}>
            ❌ {errMsg}
          </div>
        )}

        {/* ── FMCSA compliance note ── */}
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(59,130,246,0.06)',
          border: `1px solid rgba(59,130,246,0.18)`,
        }}>
          <p style={{ color: C.muted, fontSize: 11, margin: 0, lineHeight: 1.5 }}>
            📋 <strong style={{ color: C.subtext }}>FMCSA Notice:</strong> Per 49 CFR §395.26,
            you must provide your ELD records to an authorized safety official upon request.
            Refusing to transfer data is a violation and may result in an out-of-service order.
          </p>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display:'flex', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            disabled={status === 'loading'}
            style={{ ...btnOutline, flex: 1 }}>
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={
              status === 'loading' ||
              (method === 'email' && !inspEmail.includes('@'))
            }
            style={{
              ...btnPrimary, flex: 2,
              opacity: (status === 'loading' ||
                (method === 'email' && !inspEmail.includes('@'))) ? 0.5 : 1,
            }}>
            {status === 'loading'
              ? '⏳ Transmitting…'
              : method === 'local'
                ? '📥 Download ELD File'
                : '📤 Send to Inspector'}
          </button>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

/* ─── shared styles ─────────────────────────────────────────────────── */
const pageWrap = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  maxWidth: 480,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
};

const card = {
  background: C.surface,
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  padding: '14px 14px',
  marginBottom: 14,
};

const cardTitle = {
  fontSize: 13,
  fontWeight: 700,
  color: C.subtext,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 12,
};

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: '#0f172a',
  color: C.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const btnPrimary = {
  padding: '14px 0',
  borderRadius: 10,
  background: C.blue,
  border: 'none',
  color: '#fff',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
};

const btnOutline = {
  padding: '14px 0',
  borderRadius: 10,
  background: 'transparent',
  border: `1px solid ${C.border}`,
  color: C.subtext,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

/* ─── date helpers ──────────────────────────────────────────────────── */
function today() {
  return new Date().toISOString().split('T')[0];
}
function todayMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
