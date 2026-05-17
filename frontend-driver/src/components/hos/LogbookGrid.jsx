/**
 * src/components/hos/LogbookGrid.jsx
 *
 * 24-hour logbook grid — the standard FMCSA paper log reproduced as SVG.
 *
 * Layout:
 *   - X axis: 0:00 → 24:00 (midnight to midnight)
 *   - Y axis: 4 rows — OFF / SB / D / ON
 *   - Colored bars show time spent in each status
 *   - Hour markers every hour, bold every 2 hours
 *   - Tap a bar to see event details
 *   - Total hours per status shown on the right
 */

import { useMemo, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────
const ROWS = [
  { status: 'OFF', label: 'Off Duty',      color: '#64748b' },
  { status: 'SB',  label: 'Sleeper Berth', color: '#6366f1' },
  { status: 'D',   label: 'Driving',       color: '#22c55e' },
  { status: 'ON',  label: 'On Duty',       color: '#f59e0b' },
];

const ROW_HEIGHT  = 36;
const LABEL_WIDTH = 86;
const GRID_HEIGHT = ROWS.length * ROW_HEIGHT;
const HOURS       = 24;

const STATUS_CODE_MAP = { '1': 'OFF', '2': 'SB', '3': 'D', '4': 'ON' };

// ── Helpers ───────────────────────────────────────────────────

/**
 * Convert events array into segments: [{status, startH, endH, durationH}]
 * startH and endH are fractional hours within the day (0–24).
 */
function buildDaySegments(events, sessionDate, timezone) {
  if (!events || events.length === 0) return [];

  // Parse session date as start of day in home terminal timezone
  const dayStart = new Date(`${sessionDate}T00:00:00`);
  const dayEnd   = new Date(`${sessionDate}T23:59:59`);
  const now      = new Date();

  const segments = [];
  const activeEvents = events.filter(e => e.record_status === '1');

  for (let i = 0; i < activeEvents.length; i++) {
    const event    = activeEvents[i];
    const nextEvt  = activeEvents[i + 1];
    const statusCode = event.event_code ? String(event.event_code) : '1';
    const status   = STATUS_CODE_MAP[statusCode] || 'OFF';

    const evtTime  = new Date(event.event_datetime);
    const endTime  = nextEvt
      ? new Date(nextEvt.event_datetime)
      : (now < dayEnd ? now : dayEnd);

    // Clamp to day boundaries
    const segStart = Math.max(evtTime.getTime(), dayStart.getTime());
    const segEnd   = Math.min(endTime.getTime(), dayEnd.getTime());

    if (segEnd <= segStart) continue;

    const startH    = (segStart - dayStart.getTime()) / 3600000;
    const endH      = (segEnd   - dayStart.getTime()) / 3600000;
    const durationH = endH - startH;

    segments.push({ status, startH, endH, durationH, event });
  }

  return segments;
}

/**
 * Sum hours per status from segments.
 */
function calcTotals(segments) {
  const totals = { OFF: 0, SB: 0, D: 0, ON: 0 };
  segments.forEach(s => {
    if (totals[s.status] !== undefined) totals[s.status] += s.durationH;
  });
  return totals;
}

function fmtHours(h) {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm  = totalMin % 60;
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

// ── Main Component ────────────────────────────────────────────

export default function LogbookGrid({
  events = [],
  sessionDate,
  timezone = 'America/Chicago',
  onEventTap,
}) {
  const [selectedSeg, setSelectedSeg] = useState(null);

  const segments = useMemo(
    () => buildDaySegments(events, sessionDate, timezone),
    [events, sessionDate, timezone]
  );

  const totals = useMemo(() => calcTotals(segments), [segments]);

  // Responsive: use viewBox so it scales on mobile
  const SVG_WIDTH   = 500;
  const TOTAL_WIDTH = SVG_WIDTH - LABEL_WIDTH - 50; // 50 for totals column

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
      {/* Date header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #334155',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>
          📅 {sessionDate || 'Today'}
        </span>
        <span style={{ color: '#64748b', fontSize: 11 }}>
          {timezone}
        </span>
      </div>

      {/* SVG Grid */}
      <div style={{ overflowX: 'auto', padding: '8px 0' }}>
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${GRID_HEIGHT + 28}`}
          style={{ width: '100%', minWidth: 320, display: 'block' }}
          aria-label="24-hour logbook grid"
        >
          {/* Hour tick marks along top */}
          {Array.from({ length: HOURS + 1 }, (_, h) => {
            const x = LABEL_WIDTH + (h / HOURS) * TOTAL_WIDTH;
            const isMajor = h % 2 === 0;
            return (
              <g key={h}>
                <line
                  x1={x} y1={0}
                  x2={x} y2={GRID_HEIGHT}
                  stroke={isMajor ? '#334155' : '#1e293b'}
                  strokeWidth={isMajor ? 1 : 0.5}
                />
                {isMajor && (
                  <text
                    x={x} y={GRID_HEIGHT + 16}
                    textAnchor="middle"
                    fill="#475569"
                    fontSize="9"
                  >
                    {h === 0 ? 'M' : h === 12 ? 'N' : h < 12 ? h : h - 12}
                  </text>
                )}
              </g>
            );
          })}

          {/* AM / PM label */}
          <text x={LABEL_WIDTH + TOTAL_WIDTH * 0.25} y={GRID_HEIGHT + 26}
            textAnchor="middle" fill="#334155" fontSize="8">AM</text>
          <text x={LABEL_WIDTH + TOTAL_WIDTH * 0.75} y={GRID_HEIGHT + 26}
            textAnchor="middle" fill="#334155" fontSize="8">PM</text>

          {/* Rows */}
          {ROWS.map((row, rowIdx) => {
            const y = rowIdx * ROW_HEIGHT;

            return (
              <g key={row.status}>
                {/* Row background */}
                <rect
                  x={LABEL_WIDTH} y={y}
                  width={TOTAL_WIDTH} height={ROW_HEIGHT}
                  fill={rowIdx % 2 === 0 ? '#0f172a' : '#162032'}
                />

                {/* Status label */}
                <text
                  x={LABEL_WIDTH - 6} y={y + ROW_HEIGHT / 2 + 4}
                  textAnchor="end"
                  fill={row.color}
                  fontSize="10"
                  fontWeight="600"
                >
                  {row.status}
                </text>
                <text
                  x={LABEL_WIDTH - 6} y={y + ROW_HEIGHT / 2 + 14}
                  textAnchor="end"
                  fill="#475569"
                  fontSize="7"
                >
                  {row.label}
                </text>

                {/* Status bars */}
                {segments
                  .filter(s => s.status === row.status)
                  .map((seg, i) => {
                    const barX = LABEL_WIDTH + (seg.startH / HOURS) * TOTAL_WIDTH;
                    const barW = Math.max(1, (seg.durationH / HOURS) * TOTAL_WIDTH);
                    const isSelected = selectedSeg === seg;

                    return (
                      <rect
                        key={i}
                        x={barX}
                        y={y + 4}
                        width={barW}
                        height={ROW_HEIGHT - 8}
                        rx={3}
                        fill={row.color}
                        opacity={isSelected ? 1 : 0.85}
                        stroke={isSelected ? '#fff' : 'none'}
                        strokeWidth={1}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedSeg(isSelected ? null : seg);
                          onEventTap && onEventTap(seg);
                        }}
                      />
                    );
                  })}

                {/* Total hours on right */}
                <text
                  x={LABEL_WIDTH + TOTAL_WIDTH + 6}
                  y={y + ROW_HEIGHT / 2 + 4}
                  fill={totals[row.status] > 0 ? row.color : '#334155'}
                  fontSize="10"
                  fontWeight="600"
                >
                  {fmtHours(totals[row.status])}
                </text>

                {/* Row bottom border */}
                <line
                  x1={LABEL_WIDTH} y1={y + ROW_HEIGHT}
                  x2={LABEL_WIDTH + TOTAL_WIDTH} y2={y + ROW_HEIGHT}
                  stroke="#334155" strokeWidth={0.5}
                />
              </g>
            );
          })}

          {/* Current time indicator */}
          {sessionDate === new Date().toISOString().slice(0, 10) && (() => {
            const now    = new Date();
            const h      = now.getHours() + now.getMinutes() / 60;
            const x      = LABEL_WIDTH + (h / HOURS) * TOTAL_WIDTH;
            return (
              <line
                x1={x} y1={0}
                x2={x} y2={GRID_HEIGHT}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.8}
              />
            );
          })()}
        </svg>
      </div>

      {/* Selected segment detail */}
      {selectedSeg && (
        <div style={{
          margin: '0 12px 12px',
          padding: '10px 12px',
          background: '#0f172a',
          borderRadius: 8,
          border: '1px solid #334155',
          fontSize: 12,
          color: '#94a3b8',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: ROWS.find(r => r.status === selectedSeg.status)?.color, fontWeight: 700 }}>
              {selectedSeg.status} — {ROWS.find(r => r.status === selectedSeg.status)?.label}
            </span>
            <span>{fmtHours(selectedSeg.durationH)}</span>
          </div>
          <div>
            {new Date(selectedSeg.event.event_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {selectedSeg.event.annotation && (
              <span style={{ marginLeft: 8, color: '#64748b' }}>
                — {selectedSeg.event.annotation}
              </span>
            )}
          </div>
          {selectedSeg.event.special_condition && (
            <div style={{ marginTop: 4, color: '#6366f1' }}>
              {selectedSeg.event.special_condition === 'personal_conveyance' ? 'PC' : 'YM'}
            </div>
          )}
        </div>
      )}

      {/* Totals summary */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid #334155',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {ROWS.map(row => (
          <div key={row.status} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2,
              background: row.color, display: 'inline-block',
            }} />
            <span style={{ color: '#64748b', fontSize: 11 }}>{row.status}</span>
            <span style={{
              color: totals[row.status] > 0 ? row.color : '#334155',
              fontSize: 12, fontWeight: 600,
            }}>
              {fmtHours(totals[row.status])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
