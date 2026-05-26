/**
 * frontend-dispatcher/src/components/IFTAReports.jsx
 *
 * IFTA Quarterly Reports — modal panel.
 * Two tabs: MILES (jurisdictional mileage) and REPORT (quarterly filing).
 */

import { useEffect, useState } from 'react';

const API = 'http://localhost:3000';

const YEARS    = [2024, 2025, 2026, 2027];
const QUARTERS = [1, 2, 3, 4];

function authHeaders() {
  const token = localStorage.getItem('dispatcher_token') || '';
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

function currentQuarter() {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function fmtMiles(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtGal(n) {
  return Number(n || 0).toFixed(3);
}
function fmtDollars(n) {
  const v = Number(n || 0);
  return (v >= 0 ? '$' : '-$') + Math.abs(v).toFixed(2);
}
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDatetime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function IFTAReports({ onClose }) {
  const [selectedYear,       setSelectedYear]       = useState(new Date().getFullYear());
  const [selectedQuarter,    setSelectedQuarter]    = useState(currentQuarter());
  const [milesData,          setMilesData]          = useState(null);
  const [reportData,         setReportData]         = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [calculating,        setCalculating]        = useState(false);
  const [generating,         setGenerating]         = useState(false);
  const [error,              setError]              = useState(null);
  const [activeTab,          setActiveTab]          = useState('miles');
  const [filingMode,         setFilingMode]         = useState(false);
  const [confirmationInput,  setConfirmationInput]  = useState('');

  // ── Fetch both miles and report ────────────────────────
  async function fetchAll(year, quarter) {
    setLoading(true); setError(null);
    try {
      const [mRes, rRes] = await Promise.all([
        fetch(`${API}/api/ifta/miles?year=${year}&quarter=${quarter}`, { headers: authHeaders() }),
        fetch(`${API}/api/ifta/reports/${year}/${quarter}`,            { headers: authHeaders() }),
      ]);

      if (mRes.status === 401 || rRes.status === 401) {
        setError('Session expired. Please log in again.'); return;
      }

      setMilesData(mRes.ok ? (await mRes.json()) : null);
      setReportData(rRes.status === 404 ? null : rRes.ok ? (await rRes.json()).report : null);
    } catch (e) {
      console.error('[IFTAReports.fetchAll]', e);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Mount ──────────────────────────────────────────────
  useEffect(() => {
    fetchAll(selectedYear, selectedQuarter);
  }, []);

  // ── Year/Quarter change ────────────────────────────────
  function handlePeriodChange(year, quarter) {
    setSelectedYear(year);
    setSelectedQuarter(quarter);
    setReportData(null);
    setMilesData(null);
    setError(null);
    setFilingMode(false);
    fetchAll(year, quarter);
  }

  // ── Recalculate miles ──────────────────────────────────
  async function handleRecalculate() {
    setCalculating(true); setError(null);
    try {
      const res = await fetch(`${API}/api/ifta/miles/recalculate`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ year: selectedYear, quarter: selectedQuarter }),
      });
      const json = await res.json();
      if (res.status === 401) { setError('Session expired.'); return; }
      if (!res.ok)            { setError(json.message || 'Recalculation failed.'); return; }

      // Refresh miles from the mileage endpoint
      const mRes = await fetch(
        `${API}/api/ifta/miles?year=${selectedYear}&quarter=${selectedQuarter}`,
        { headers: authHeaders() }
      );
      if (mRes.ok) setMilesData(await mRes.json());
    } catch (e) {
      console.error('[IFTAReports.recalculate]', e);
      setError('Network error. Try again.');
    } finally {
      setCalculating(false);
    }
  }

  // ── Generate report ────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true); setError(null);
    try {
      const res = await fetch(`${API}/api/ifta/reports/generate`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ year: selectedYear, quarter: selectedQuarter }),
      });
      const json = await res.json();

      if (res.status === 401) { setError('Session expired.'); return; }
      if (res.status === 422) {
        setError('No GPS miles. Go to the Miles tab and run RECALCULATE first.');
        return;
      }
      if (res.status === 409) {
        setError('Report is finalized/filed and cannot be regenerated.');
        return;
      }
      if (!res.ok) { setError(json.message || 'Generation failed. Try again.'); return; }

      setReportData(json.report);
    } catch (e) {
      console.error('[IFTAReports.generate]', e);
      setError('Network error. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  // ── Finalize ───────────────────────────────────────────
  async function handleFinalize() {
    if (!window.confirm(
      `Finalize Q${selectedQuarter} ${selectedYear} report? This locks the report and prevents regeneration.`
    )) return;
    setError(null);
    try {
      const res = await fetch(`${API}/api/ifta/reports/${reportData.id}/finalize`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.status === 401) { setError('Session expired.'); return; }
      if (res.status === 409) { setError(json.message || 'Cannot finalize.'); return; }
      if (!res.ok)            { setError(json.message || 'Server error.'); return; }
      setReportData(json.report);
    } catch (e) {
      setError('Network error. Try again.');
    }
  }

  // ── File ───────────────────────────────────────────────
  async function handleFile() {
    setError(null);
    try {
      const res = await fetch(`${API}/api/ifta/reports/${reportData.id}/file`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ confirmation_number: confirmationInput.trim() || undefined }),
      });
      const json = await res.json();
      if (res.status === 401) { setError('Session expired.'); return; }
      if (res.status === 409) { setError(json.message || 'Cannot file.'); return; }
      if (!res.ok)            { setError(json.message || 'Server error.'); return; }
      setReportData(json.report);
      setFilingMode(false);
      setConfirmationInput('');
    } catch (e) {
      setError('Network error. Try again.');
    }
  }

  // ── Derived values ─────────────────────────────────────
  const breakdown = (() => {
    if (!reportData) return [];
    const raw = reportData.jurisdiction_breakdown;
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  })();

  const netTaxTotal = breakdown.reduce((s, r) => s + Number(r.net_tax || 0), 0);

  // ── Shared styles ──────────────────────────────────────
  const inputSt = {
    background: 'var(--surface-mid)', border: '1px solid var(--outline)',
    borderRadius: 'var(--r-md)', color: 'var(--on-surface)',
    padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none',
  };

  // ── Period selector (reused in both tabs) ──────────────
  function PeriodSelector() {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-dim)', letterSpacing: '0.06em' }}>PERIOD</span>
        {YEARS.map(y => (
          <button key={y} onClick={() => handlePeriodChange(y, selectedQuarter)}
            style={{
              padding: '4px 12px', borderRadius: 'var(--r-full)',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${y === selectedYear ? 'var(--primary)' : 'var(--outline)'}`,
              background: y === selectedYear ? 'var(--primary-glow)' : 'transparent',
              color: y === selectedYear ? 'var(--primary)' : 'var(--on-surface-dim)',
              transition: 'all var(--ease-fast)',
            }}>
            {y}
          </button>
        ))}
        <span style={{ color: 'var(--outline)', margin: '0 4px' }}>|</span>
        {QUARTERS.map(q => (
          <button key={q} onClick={() => handlePeriodChange(selectedYear, q)}
            style={{
              padding: '4px 12px', borderRadius: 'var(--r-full)',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${q === selectedQuarter ? 'var(--primary)' : 'var(--outline)'}`,
              background: q === selectedQuarter ? 'var(--primary-glow)' : 'transparent',
              color: q === selectedQuarter ? 'var(--primary)' : 'var(--on-surface-dim)',
              transition: 'all var(--ease-fast)',
            }}>
            Q{q}
          </button>
        ))}
      </div>
    );
  }

  // ── Status badge ───────────────────────────────────────
  function StatusBadge({ status }) {
    const cfg = {
      draft:      { color: 'var(--warning)',  label: 'DRAFT'      },
      finalized:  { color: 'var(--ok)',       label: 'FINALIZED'  },
      filed:      { color: 'var(--primary)',  label: 'FILED'      },
      amended:    { color: 'var(--secondary)','label': 'AMENDED'  },
    }[status] || { color: 'var(--on-surface-dim)', label: '—' };

    return (
      <span style={{
        display: 'inline-block', padding: '3px 10px',
        borderRadius: 'var(--r-full)', border: `1px solid ${cfg.color}`,
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        color: cfg.color, letterSpacing: '0.06em',
      }}>
        {cfg.label}
      </span>
    );
  }

  // ── MILES TAB ─────────────────────────────────────────
  function MilesTab() {
    const jurs       = milesData?.jurisdictions || [];
    const totalMiles = milesData?.total_miles   || 0;

    return (
      <div>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--outline)',
          background: 'var(--surface-mid)', display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', gap: 12 }}>
          <PeriodSelector />
          <div style={{ flex: 1 }} />
          <div>
            <button onClick={handleRecalculate} disabled={calculating}
              style={{
                padding: '8px 20px',
                background: calculating ? 'transparent' : 'var(--primary)',
                border: `1px solid ${calculating ? 'var(--outline)' : 'transparent'}`,
                borderRadius: 'var(--r-md)', cursor: calculating ? 'not-allowed' : 'pointer',
                color: calculating ? 'var(--on-surface-dim)' : 'black',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', opacity: calculating ? 0.7 : 1,
              }}>
              {calculating ? '⏳ CALCULATING...' : '🔄 RECALCULATE MILES'}
            </button>
          </div>
        </div>

        {/* Recalculate warning */}
        <div style={{ margin: '10px 20px', padding: '8px 14px',
          borderRadius: 'var(--r-md)', background: 'var(--warning-glow)',
          border: '1px solid var(--warning)', fontSize: 12,
          fontFamily: 'var(--font-mono)', color: 'var(--warning)' }}>
          ⚠️ Synchronous operation. May take 30–120s for large fleets.
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)',
            fontSize: 13, color: 'var(--on-surface-dim)' }}>
            LOADING...
          </div>
        )}

        {/* No data */}
        {!loading && jurs.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)',
            fontSize: 13, color: 'var(--on-surface-dim)' }}>
            No miles data. Run RECALCULATE to process GPS breadcrumbs.
          </div>
        )}

        {/* Miles table */}
        {!loading && jurs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-mid)', borderBottom: '1px solid var(--outline)' }}>
                  {['State', 'Miles', '% of Total', 'Taxable Miles', 'Method', 'Breadcrumbs', 'Last Calc'].map(h => (
                    <th key={h} style={{
                      padding: '8px 14px', textAlign: h === 'State' ? 'left' : 'right',
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                      color: 'var(--on-surface-dim)', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jurs.map((j, i) => {
                  const pct = totalMiles > 0
                    ? ((Number(j.total_miles) / totalMiles) * 100).toFixed(1)
                    : '0.0';
                  return (
                    <tr key={j.jurisdiction_code} style={{
                      borderBottom: '1px solid var(--outline)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          borderRadius: 'var(--r-full)', background: 'var(--surface-high)',
                          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                          color: 'var(--on-surface)', letterSpacing: '0.04em',
                        }}>{j.jurisdiction_code}</span>
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right',
                        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface)' }}>
                        {fmtMiles(j.total_miles)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right',
                        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface-dim)' }}>
                        {pct}%
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right',
                        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface-dim)' }}>
                        {fmtMiles(j.taxable_miles)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right',
                        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-dim)',
                        textTransform: 'uppercase' }}>
                        {j.calculation_method || 'gps'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right',
                        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface-dim)' }}>
                        {Number(j.breadcrumbs_count || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right',
                        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-dim)',
                        whiteSpace: 'nowrap' }}>
                        {j.calculated_at ? fmtDate(j.calculated_at) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--outline)', background: 'var(--surface-mid)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)',
                    fontSize: 12, fontWeight: 700, color: 'var(--on-surface)' }}>
                    TOTAL
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right',
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                    {fmtMiles(totalMiles)}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── REPORT TAB ────────────────────────────────────────
  function ReportTab() {
    const status = reportData?.status || null;

    return (
      <div>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--outline)',
          background: 'var(--surface-mid)', display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', gap: 12 }}>
          <PeriodSelector />
          <StatusBadge status={status} />
          <div style={{ flex: 1 }} />
          <button onClick={handleGenerate} disabled={generating}
            style={{
              padding: '8px 20px',
              background: generating ? 'transparent' : 'var(--primary)',
              border: `1px solid ${generating ? 'var(--outline)' : 'transparent'}`,
              borderRadius: 'var(--r-md)', cursor: generating ? 'not-allowed' : 'pointer',
              color: generating ? 'var(--on-surface-dim)' : 'black',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', opacity: generating ? 0.7 : 1,
            }}>
            {generating ? '⏳ GENERATING...' : '📋 GENERATE REPORT'}
          </button>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)',
            fontSize: 13, color: 'var(--on-surface-dim)' }}>LOADING...</div>
        )}

        {!loading && !reportData && (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)',
            fontSize: 13, color: 'var(--on-surface-dim)' }}>
            No report for Q{selectedQuarter} {selectedYear}.
            Click GENERATE REPORT to create one.
          </div>
        )}

        {!loading && reportData && (
          <div style={{ padding: '16px 20px' }}>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                {
                  label: 'Total Miles',
                  value: Number(reportData.total_miles_all_jurisdictions || 0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}),
                  color: 'var(--on-surface)',
                },
                {
                  label: 'Taxable Gallons',
                  value: fmtGal(reportData.total_taxable_gallons),
                  color: 'var(--on-surface)',
                },
                {
                  label: 'Net Tax',
                  value: (netTaxTotal >= 0 ? '+' : '') + fmtDollars(netTaxTotal),
                  color: netTaxTotal > 0 ? 'var(--danger)' : netTaxTotal < 0 ? 'var(--ok)' : 'var(--on-surface)',
                },
                {
                  label: 'Status',
                  value: (reportData.status || '—').toUpperCase(),
                  color: { draft:'var(--warning)', finalized:'var(--ok)', filed:'var(--primary)' }[reportData.status] || 'var(--on-surface-dim)',
                },
              ].map(card => (
                <div key={card.label} style={{
                  background: 'var(--surface-mid)', border: '1px solid var(--outline)',
                  borderRadius: 'var(--r-md)', padding: '14px 16px',
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-dim)',
                    letterSpacing: '0.06em', marginBottom: 8 }}>
                    {card.label.toUpperCase()}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: card.color }}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Generated at */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-dim)',
              marginBottom: 14 }}>
              Generated: {fmtDatetime(reportData.generated_at)}
            </div>

            {/* Jurisdiction breakdown table */}
            {breakdown.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-mid)', borderBottom: '1px solid var(--outline)' }}>
                      {['State', 'Miles', 'Tax Rate', 'Taxable Gal', 'Tax Owed', 'Paid at Pump', 'Net Tax'].map(h => (
                        <th key={h} style={{
                          padding: '8px 14px', textAlign: h === 'State' ? 'left' : 'right',
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                          color: 'var(--on-surface-dim)', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((r, i) => {
                      const net     = Number(r.net_tax || 0);
                      const netColor = net > 0 ? 'var(--danger)' : net < 0 ? 'var(--ok)' : 'var(--on-surface-dim)';
                      return (
                        <tr key={r.jurisdiction} style={{
                          borderBottom: '1px solid var(--outline)',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        }}>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px',
                              borderRadius: 'var(--r-full)', background: 'var(--surface-high)',
                              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                              color: 'var(--on-surface)', letterSpacing: '0.04em',
                            }}>{r.jurisdiction}</span>
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {fmtMiles(r.miles)}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface-dim)' }}>
                            —
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface-dim)' }}>
                            {fmtGal(r.taxable_gallons)}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {fmtDollars(r.tax_owed)}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface-dim)' }}>
                            {fmtDollars(r.tax_paid_at_pump)}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                            fontSize: 12, fontWeight: 700, color: netColor }}>
                            {net >= 0 ? '+' : ''}{fmtDollars(net)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--outline)', background: 'var(--surface-mid)' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>TOTAL</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                        {fmtMiles(reportData.total_miles_all_jurisdictions)}
                      </td>
                      <td />
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                        {fmtGal(reportData.total_taxable_gallons)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                        {fmtDollars(breakdown.reduce((s,r) => s + Number(r.tax_owed || 0), 0))}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--on-surface-dim)' }}>
                        {fmtDollars(reportData.total_tax_paid)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                        fontSize: 12, fontWeight: 700,
                        color: netTaxTotal > 0 ? 'var(--danger)' : netTaxTotal < 0 ? 'var(--ok)' : 'var(--on-surface)' }}>
                        {netTaxTotal >= 0 ? '+' : ''}{fmtDollars(netTaxTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Action buttons based on status */}
            <div style={{ borderTop: '1px solid var(--outline)', paddingTop: 16 }}>
              {status === 'draft' && (
                <button onClick={handleFinalize} style={{
                  padding: '9px 24px', background: 'var(--ok)', border: 'none',
                  borderRadius: 'var(--r-md)', color: 'black', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                }}>✅ FINALIZE REPORT</button>
              )}

              {status === 'finalized' && !filingMode && (
                <button onClick={() => setFilingMode(true)} style={{
                  padding: '9px 24px', background: 'var(--primary)', border: 'none',
                  borderRadius: 'var(--r-md)', color: 'black', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                }}>📤 MARK AS FILED</button>
              )}

              {status === 'finalized' && filingMode && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: 'var(--on-surface-dim)', marginBottom: 4, letterSpacing: '0.04em' }}>
                      CONFIRMATION NUMBER (optional)
                    </label>
                    <input type="text" style={{ ...inputSt, width: 280 }}
                      placeholder="e.g. IFTA-2026-Q1-12345"
                      value={confirmationInput}
                      onChange={e => setConfirmationInput(e.target.value)} />
                  </div>
                  <button onClick={handleFile} style={{
                    padding: '8px 20px', background: 'var(--primary)', border: 'none',
                    borderRadius: 'var(--r-md)', color: 'black', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  }}>CONFIRM FILING</button>
                  <button onClick={() => { setFilingMode(false); setConfirmationInput(''); }} style={{
                    padding: '8px 20px', background: 'transparent',
                    border: '1px solid var(--outline)', borderRadius: 'var(--r-md)',
                    color: 'var(--on-surface-dim)', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                  }}>CANCEL</button>
                </div>
              )}

              {status === 'filed' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ok)' }}>
                  <div>Filed on {fmtDatetime(reportData.filed_at)}</div>
                  {reportData.filed_confirmation_number && (
                    <div style={{ marginTop: 4, color: 'var(--on-surface-dim)' }}>
                      Confirmation: {reportData.filed_confirmation_number}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,14,23,0.85)',
      zIndex: 1100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '24px 16px', overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 960,
        background: 'var(--surface-low)',
        border: '1px solid var(--outline)',
        borderRadius: 'var(--r-lg)',
        display: 'flex', flexDirection: 'column',
        marginTop: 'auto', marginBottom: 'auto',
        minHeight: 400,
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--outline)',
          background: 'var(--surface-mid)',
          borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>
            📋 IFTA QUARTERLY REPORTS
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--outline)',
            color: 'var(--on-surface-dim)', borderRadius: 'var(--r-md)',
            padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-mono)',
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--outline)',
          background: 'var(--surface-mid)' }}>
          {[{ id: 'miles', label: '📏 MILES' }, { id: 'report', label: '📄 REPORT' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '10px 24px', background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--on-surface-dim)',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', cursor: 'pointer',
              transition: 'all var(--ease-fast)', marginBottom: -1,
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ margin: '12px 20px 0', padding: '8px 14px', borderRadius: 'var(--r-md)',
            background: 'var(--danger-glow)', border: '1px solid var(--danger)',
            color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {error}
            <button onClick={() => setError(null)} style={{
              float: 'right', background: 'none', border: 'none',
              color: 'var(--danger)', cursor: 'pointer', fontSize: 14,
            }}>✕</button>
          </div>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'miles'  ? <MilesTab  /> : <ReportTab />}
        </div>
      </div>
    </div>
  );
}
