/**
 * src/pages/DVIRPage.jsx
 * Vehicle inspection page — wraps DVIRForm and handles API submission.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import { useHOS }  from '../store/HOSContext';
import DVIRForm    from '../components/dvir/DVIRForm';
import api         from '../api/client';

export default function DVIRPage() {
  const { t }          = useTranslation();
  const navigate       = useNavigate();
  const { driver }     = useAuth();
  const { session }    = useHOS();

  const [submitted, setSubmitted] = useState(false);
  const [result,    setResult]    = useState(null);

  const handleSubmit = async (formData) => {
    // Get GPS location
    let lat = null, lon = null;
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    } catch {}

    const payload = {
      ...formData,
      session_id: session?.id || null,
      latitude:   lat,
      longitude:  lon,
    };

    const { data } = await api.post('/dvir', payload);
    setResult(data);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f172a',
        color: '#f1f5f9', maxWidth: 480, margin: '0 auto',
        padding: 16, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Inspection Submitted
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 32, textAlign: 'center' }}>
          {result?.report?.defects_found
            ? 'Defects recorded. Mechanic review required before next trip.'
            : 'Vehicle in satisfactory condition. Safe to operate.'}
        </p>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '14px 40px', borderRadius: 10,
            background: '#3b82f6', border: 'none',
            color: '#fff', fontWeight: 700, fontSize: 15,
            cursor: 'pointer',
          }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

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
        <button onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: '#64748b',
            fontSize: 20, cursor: 'pointer', padding: 0 }}>
          ←
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 600 }}>{t('dvir')}</h1>
      </div>

      <div style={{ padding: 16 }}>
        <DVIRForm
          onSubmit={handleSubmit}
          onCancel={() => navigate('/')}
        />
      </div>
    </div>
  );
}
