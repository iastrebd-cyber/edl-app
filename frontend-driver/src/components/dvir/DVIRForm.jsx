/**
 * src/components/dvir/DVIRForm.jsx
 *
 * Driver Vehicle Inspection Report form.
 * Required by FMCSA §396.11 — pre and post trip.
 *
 * Sections:
 *   1. Report type (pre/post)
 *   2. Vehicle components checklist
 *   3. Defect details (if any found)
 *   4. Safe to operate toggle
 *   5. Digital signature canvas
 *   6. Submit
 */

import { useState } from 'react';
import { useTranslation }  from 'react-i18next';
import SignatureCanvas     from '../shared/SignatureCanvas';

// FMCSA §396.11 required inspection items
const INSPECTION_ITEMS = [
  { id: 'service_brakes',    label: 'Service Brakes (including trailer brake connections)' },
  { id: 'parking_brake',     label: 'Parking Brake' },
  { id: 'steering',          label: 'Steering Mechanism' },
  { id: 'lighting',          label: 'Lighting Devices and Reflectors' },
  { id: 'tires',             label: 'Tires' },
  { id: 'horn',              label: 'Horn' },
  { id: 'windshield_wipers', label: 'Windshield Wipers' },
  { id: 'mirrors',           label: 'Rear-Vision Mirrors' },
  { id: 'coupling_devices',  label: 'Coupling Devices' },
  { id: 'wheels_rims',       label: 'Wheels and Rims' },
  { id: 'emergency_equip',   label: 'Emergency Equipment' },
  { id: 'fuel_system',       label: 'Fuel System' },
  { id: 'exhaust',           label: 'Exhaust System' },
  { id: 'frame',             label: 'Frame and Body' },
];

// ── Main DVIR Form ────────────────────────────────────────────
export default function DVIRForm({ onSubmit, onCancel, vehicleInfo }) {
  const { t } = useTranslation();

  const [reportType,   setReportType]   = useState('pre');
  const [defects,      setDefects]      = useState({});  // { item_id: { description, severity } }
  const [safeToOperate, setSafeToOperate] = useState(true);
  const [signature,    setSignature]    = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState(null);

  const defectsFound = Object.keys(defects).length > 0;

  const toggleDefect = (itemId) => {
    setDefects(prev => {
      if (prev[itemId]) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: { description: '', severity: 'minor' },
      };
    });
  };

  const updateDefect = (itemId, field, value) => {
    setDefects(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!signature) {
      setError('Driver signature is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const defectList = Object.entries(defects).map(([id, d]) => ({
        component:   INSPECTION_ITEMS.find(i => i.id === id)?.label || id,
        description: d.description,
        severity:    d.severity,
      }));

      await onSubmit({
        report_type:    reportType,
        defects:        defectList,
        defects_found:  defectsFound,
        safe_to_operate: safeToOperate,
        driver_signature: signature,
        driver_signed_at: new Date().toISOString(),
      });
    } catch (err) {
      setError(err.message || 'Failed to submit inspection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ color: '#f1f5f9' }}>
      {/* Report type selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { value: 'pre',  label: '🌅 Pre-Trip' },
          { value: 'post', label: '🌙 Post-Trip' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setReportType(value)}
            style={{
              flex: 1, padding: '12px 0',
              borderRadius: 10,
              border: `2px solid ${reportType === value ? '#3b82f6' : '#334155'}`,
              background: reportType === value ? '#1e3a5f' : '#1e293b',
              color: reportType === value ? '#93c5fd' : '#64748b',
              fontWeight: 600, fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Vehicle info */}
      {vehicleInfo && (
        <div style={{
          padding: '10px 14px', marginBottom: 16,
          background: '#1e293b', borderRadius: 8,
          border: '1px solid #334155',
          fontSize: 13, color: '#94a3b8',
        }}>
          🚛 {vehicleInfo.make} {vehicleInfo.model} — {vehicleInfo.plate_number}
        </div>
      )}

      {/* Inspection checklist */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Inspection Items
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {INSPECTION_ITEMS.map((item) => {
            const hasDefect = !!defects[item.id];
            return (
              <div key={item.id}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px',
                    background: hasDefect ? '#450a0a' : '#1e293b',
                    border: `1px solid ${hasDefect ? '#ef4444' : '#334155'}`,
                    borderRadius: hasDefect ? '8px 8px 0 0' : 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleDefect(item.id)}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    border: `2px solid ${hasDefect ? '#ef4444' : '#334155'}`,
                    background: hasDefect ? '#ef4444' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {hasDefect && <span style={{ color: '#fff', fontSize: 12 }}>✕</span>}
                  </div>
                  <span style={{ fontSize: 13, color: hasDefect ? '#fca5a5' : '#e2e8f0' }}>
                    {item.label}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 11,
                    color: hasDefect ? '#f87171' : '#22c55e',
                  }}>
                    {hasDefect ? 'DEFECT' : 'OK'}
                  </span>
                </div>

                {/* Defect details */}
                {hasDefect && (
                  <div style={{
                    padding: '10px 12px',
                    background: '#300',
                    border: '1px solid #ef4444',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                  }}>
                    <input
                      type="text"
                      placeholder="Describe the defect..."
                      value={defects[item.id].description}
                      onChange={e => updateDefect(item.id, 'description', e.target.value)}
                      style={{
                        width: '100%', padding: '6px 10px',
                        background: '#1e293b', border: '1px solid #334155',
                        borderRadius: 6, color: '#f1f5f9', fontSize: 12,
                        marginBottom: 6, boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['minor', 'major'].map(sev => (
                        <button
                          key={sev}
                          onClick={() => updateDefect(item.id, 'severity', sev)}
                          style={{
                            padding: '4px 12px', borderRadius: 6, fontSize: 11,
                            border: `1px solid ${defects[item.id].severity === sev
                              ? (sev === 'major' ? '#ef4444' : '#f59e0b')
                              : '#334155'}`,
                            background: defects[item.id].severity === sev
                              ? (sev === 'major' ? '#450a0a' : '#78350f')
                              : 'transparent',
                            color: defects[item.id].severity === sev
                              ? (sev === 'major' ? '#fca5a5' : '#fde68a')
                              : '#64748b',
                            cursor: 'pointer', textTransform: 'capitalize',
                          }}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Safe to operate */}
      {defectsFound && (
        <div style={{
          padding: '12px 14px', marginBottom: 16,
          background: '#1e293b', borderRadius: 10,
          border: '1px solid #334155',
        }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>
            Defects noted. Is vehicle safe to operate?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: true,  label: '✓ Safe to operate', color: '#22c55e' },
              { value: false, label: '✕ Out of service',  color: '#ef4444' },
            ].map(({ value, label, color }) => (
              <button
                key={String(value)}
                onClick={() => setSafeToOperate(value)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: `2px solid ${safeToOperate === value ? color : '#334155'}`,
                  background: safeToOperate === value ? color + '22' : 'transparent',
                  color: safeToOperate === value ? color : '#64748b',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div style={{
        padding: '10px 14px', marginBottom: 16,
        background: defectsFound ? '#450a0a' : '#052e16',
        border: `1px solid ${defectsFound ? '#ef4444' : '#22c55e'}`,
        borderRadius: 8, fontSize: 13,
        color: defectsFound ? '#fca5a5' : '#86efac',
      }}>
        {defectsFound
          ? `⚠ ${Object.keys(defects).length} defect(s) found`
          : '✓ No defects found — vehicle in satisfactory condition'}
      </div>

      {/* Signature */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Driver Signature
        </h3>
        <SignatureCanvas onSign={setSignature} />
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', marginBottom: 12,
          background: '#450a0a', border: '1px solid #ef4444',
          borderRadius: 8, color: '#fca5a5', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 10,
            border: '1px solid #334155', background: 'transparent',
            color: '#64748b', cursor: 'pointer', fontSize: 14,
          }}>
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            flex: 2, padding: '14px 0', borderRadius: 10,
            border: 'none',
            background: submitting ? '#334155' : '#3b82f6',
            color: submitting ? '#64748b' : '#fff',
            fontWeight: 700, fontSize: 14,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>
          {submitting ? 'Submitting...' : `Submit ${reportType === 'pre' ? 'Pre' : 'Post'}-Trip Inspection`}
        </button>
      </div>
    </div>
  );
}
