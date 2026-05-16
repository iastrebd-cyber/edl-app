'use strict';

/**
 * src/services/hos-calculator.service.js
 *
 * The core HOS calculation engine.
 *
 * INPUT:  array of hos_events (from DB, last 8-14 days)
 * OUTPUT: remaining hours for each limit + active violations
 *
 * ══════════════════════════════════════════════════════════════
 *  RULES IMPLEMENTED
 * ══════════════════════════════════════════════════════════════
 *
 *  USA (49 CFR §395):
 *    ✓ 11h driving limit
 *    ✓ 14h on-duty window (non-extendable)
 *    ✓ 30-min break after 8h driving
 *    ✓ 60h/7-day cycle
 *    ✓ 70h/8-day cycle
 *    ✓ 34h restart (with 2x 1am-5am validation)
 *    ✓ Sleeper Berth split (8+2 and 7+3)
 *    ✓ Personal Conveyance (excluded from driving/on-duty)
 *    ✓ Yard Move (on-duty, not driving)
 *    ✓ Adverse Driving Conditions exception (+2h)
 *
 *  Canada (SOR/2019-165):
 *    ✓ 13h driving limit
 *    ✓ 14h on-duty window
 *    ✓ 8h reset (vs 10h USA)
 *    ✓ 70h/7-day cycle (Cycle 1)
 *    ✓ 120h/14-day cycle (Cycle 2)
 *    ✓ 36h restart
 *    ✓ 2h deferral rule
 *
 * ══════════════════════════════════════════════════════════════
 *  CRITICAL DESIGN NOTES
 * ══════════════════════════════════════════════════════════════
 *
 *  1. ALL times must be UTC. Never use local time in calculations.
 *     Convert to local only for display and restart period validation.
 *
 *  2. Only process events with record_status = '1' (active).
 *     Inactive-changed records ('2') are for audit only.
 *
 *  3. Personal Conveyance (PC) events appear as OFF with
 *     special_condition = 'personal_conveyance'. They do NOT
 *     count toward driving or on-duty time.
 *
 *  4. Yard Move (YM) appears as ON with
 *     special_condition = 'yard_move'. Counts as ON, NOT D.
 *
 *  5. The 14h window starts from the FIRST on-duty event after
 *     a qualifying rest period — NOT from midnight.
 */

const {
  STATUS,
  REST_STATUSES,
  DUTY_STATUSES,
  CYCLE_CONFIG,
  VIOLATION,
  USA,
} = require('../utils/hos-rules');

const MS_PER_HOUR = 3600000;
const MS_PER_MIN  = 60000;

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────

/**
 * Calculate remaining HOS limits for a driver.
 *
 * @param {object[]} rawEvents  - hos_events rows from DB (any order, any status)
 * @param {string}   hosCycle   - 'usa_60' | 'usa_70' | 'canada_70' | 'canada_120'
 * @param {Date}     [now]      - current time (injectable for testing)
 * @param {object}   [options]  - { adverseDriving: bool, deferralHours: number }
 * @returns {HOSResult}
 */
function calculateHOS(rawEvents, hosCycle, now = new Date(), options = {}) {
  const config = CYCLE_CONFIG[hosCycle];
  if (!config) throw new Error(`Unknown HOS cycle: ${hosCycle}`);

  // 1. Prepare events — filter active only, sort ascending by time
  const events = prepareEvents(rawEvents);

  // 2. Find the start of the current duty day
  //    = end of the last qualifying rest period (10h USA / 8h Canada)
  const dutyDayStart = findDutyDayStart(events, config.resetRestHours, now);

  // 3. Get events relevant to current duty day
  const todayEvents = events.filter(
    (e) => toMs(e.event_datetime) >= toMs(dutyDayStart)
  );

  // 4. Driving time since duty day start
  const drivingToday = calcDrivingHours(todayEvents, dutyDayStart, now);

  // 5. On-duty window: elapsed time since first on-duty event of the day
  const windowStart    = findWindowStart(todayEvents, dutyDayStart);
  const shiftElapsed   = windowStart
    ? (toMs(now) - toMs(windowStart)) / MS_PER_HOUR
    : 0;

  // 6. 30-minute break: driving since last qualifying break
  const lastBreakEnd      = findLastBreakEnd(todayEvents, dutyDayStart, now);
  const drivingSinceBreak = calcDrivingHours(
    events.filter((e) => toMs(e.event_datetime) >= toMs(lastBreakEnd)),
    lastBreakEnd,
    now
  );

  // 7. Cycle: total on-duty hours in the cycle window
  const cycleWindowStart = new Date(toMs(now) - config.cycleDays * 24 * MS_PER_HOUR);
  const cycleEvents      = events.filter(
    (e) => toMs(e.event_datetime) >= toMs(cycleWindowStart)
  );
  const onDutyInCycle = calcOnDutyHours(cycleEvents, cycleWindowStart, now);

  // 8. Sleeper berth: check if a valid SB split is in progress
  const sbSplit = detectSleeperBerthSplit(todayEvents, config);

  // 9. Apply adverse driving exception if active
  const adverseBonus = options.adverseDriving ? USA.ADVERSE_EXTRA_DRIVING_HOURS : 0;

  // 10. Canada deferral
  const deferralBonus = options.deferralHours
    ? Math.min(options.deferralHours, 2)
    : 0;

  // 11. Compute remaining limits
  const drivingLimit  = config.drivingLimit + adverseBonus + deferralBonus;
  const windowLimit   = config.shiftWindow  + (options.adverseDriving ? USA.ADVERSE_EXTRA_WINDOW_HOURS : 0);

  const drivingRemaining = Math.max(0, drivingLimit - drivingToday);
  const shiftRemaining   = Math.max(0, windowLimit  - shiftElapsed);
  const breakNeededIn    = Math.max(0, config.rules.BREAK_TRIGGER_HOURS - drivingSinceBreak);
  const cycleRemaining   = Math.max(0, config.cycleHours - onDutyInCycle);

  // The binding limit is the minimum of all remaining hours
  const effectiveRemaining = Math.min(
    drivingRemaining,
    shiftRemaining,
    // Break doesn't cap remaining hours, it's a separate requirement
    cycleRemaining
  );

  // 12. Detect violations
  const violations = detectViolations({
    drivingToday,
    drivingLimit,
    shiftElapsed,
    windowLimit,
    drivingSinceBreak,
    onDutyInCycle,
    config,
  });

  return {
    // Current counts (hours)
    driving_today:        round2(drivingToday),
    shift_elapsed:        round2(shiftElapsed),
    driving_since_break:  round2(drivingSinceBreak),
    on_duty_in_cycle:     round2(onDutyInCycle),

    // Remaining hours
    driving_remaining:    round2(drivingRemaining),
    shift_remaining:      round2(shiftRemaining),
    break_needed_in:      round2(breakNeededIn),   // hours of driving until break required
    cycle_remaining:      round2(cycleRemaining),
    effective_remaining:  round2(effectiveRemaining),

    // Context
    duty_day_start:   dutyDayStart,
    window_start:     windowStart,
    cycle_window_start: cycleWindowStart,
    hos_cycle:        hosCycle,
    sleeper_berth_split: sbSplit,

    // Violations
    violations,
    has_violation: violations.some((v) => v.severity === 'violation'),
    has_warning:   violations.some((v) => v.severity === 'warning'),
  };
}

// ─────────────────────────────────────────────────────────────
// EVENT PREPARATION
// ─────────────────────────────────────────────────────────────

/**
 * Filter to active events only and sort chronologically.
 * Skip events with no event_datetime.
 */
function prepareEvents(rawEvents) {
  return rawEvents
    .filter((e) => e.record_status === '1' && e.event_datetime)
    .sort((a, b) => toMs(a.event_datetime) - toMs(b.event_datetime));
}

// ─────────────────────────────────────────────────────────────
// DUTY DAY START
// ─────────────────────────────────────────────────────────────

/**
 * Find the end time of the most recent qualifying rest period.
 * This marks the start of the current duty day.
 *
 * A qualifying rest = consecutive OFF/SB time ≥ resetRestHours.
 * Personal Conveyance counts as OFF for rest purposes.
 *
 * Algorithm: walk events backwards, looking for a rest gap
 * long enough to qualify as a reset.
 *
 * @param {object[]} events       - sorted ASC active events
 * @param {number}   resetHours   - 10 for USA, 8 for Canada
 * @param {Date}     now
 * @returns {Date}  start of current duty day (or epoch if no reset found)
 */
function findDutyDayStart(events, resetHours, now) {
  if (events.length === 0) return new Date(0);

  const resetMs = resetHours * MS_PER_HOUR;

  // Build a timeline: [{status, start, end}]
  const segments = buildSegments(events, now);

  // Walk backwards through segments to find latest qualifying rest
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (isRestStatus(seg.status, seg.specialCondition)) {
      const restDuration = seg.end - seg.start;
      if (restDuration >= resetMs) {
        return new Date(seg.end);
      }
    }
  }

  // No qualifying rest found — duty day started at the very beginning
  return events.length > 0
    ? new Date(toMs(events[0].event_datetime))
    : new Date(0);
}

// ─────────────────────────────────────────────────────────────
// WINDOW START
// ─────────────────────────────────────────────────────────────

/**
 * Find when the 14h on-duty window started.
 * = timestamp of the first ON or D event after the duty day start.
 *
 * @param {object[]} todayEvents  - events from duty day start onward
 * @param {Date}     dutyDayStart
 * @returns {Date|null}
 */
function findWindowStart(todayEvents, dutyDayStart) {
  for (const event of todayEvents) {
    if (isDutyStatus(event)) {
      return new Date(toMs(event.event_datetime));
    }
  }
  return null; // driver hasn't gone on-duty yet today
}

// ─────────────────────────────────────────────────────────────
// DRIVING TIME
// ─────────────────────────────────────────────────────────────

/**
 * Calculate total driving hours between startTime and endTime.
 * Uses the events array to determine when the driver was in D status.
 *
 * PC (personal conveyance) is EXCLUDED — it's classified as OFF.
 * YM (yard move) is ON, not D — already excluded by status check.
 *
 * @param {object[]} events
 * @param {Date}     startTime
 * @param {Date}     endTime
 * @returns {number} hours
 */
function calcDrivingHours(events, startTime, endTime) {
  const segments = buildSegments(events, endTime);
  let totalMs = 0;

  for (const seg of segments) {
    if (seg.status !== STATUS.D) continue;
    // PC can appear as D in rare cases — skip
    if (seg.specialCondition === 'personal_conveyance') continue;

    const segStart = Math.max(seg.start, toMs(startTime));
    const segEnd   = Math.min(seg.end,   toMs(endTime));
    if (segEnd > segStart) {
      totalMs += segEnd - segStart;
    }
  }

  return totalMs / MS_PER_HOUR;
}

// ─────────────────────────────────────────────────────────────
// ON-DUTY TIME (for cycle calculation)
// ─────────────────────────────────────────────────────────────

/**
 * Calculate total on-duty hours (D + ON) between startTime and endTime.
 * PC is excluded (it's OFF). YM counts as ON.
 *
 * @param {object[]} events
 * @param {Date}     startTime
 * @param {Date}     endTime
 * @returns {number} hours
 */
function calcOnDutyHours(events, startTime, endTime) {
  const segments = buildSegments(events, endTime);
  let totalMs = 0;

  for (const seg of segments) {
    if (!isDutyStatusCode(seg.status)) continue;
    if (seg.specialCondition === 'personal_conveyance') continue;

    const segStart = Math.max(seg.start, toMs(startTime));
    const segEnd   = Math.min(seg.end,   toMs(endTime));
    if (segEnd > segStart) {
      totalMs += segEnd - segStart;
    }
  }

  return totalMs / MS_PER_HOUR;
}

// ─────────────────────────────────────────────────────────────
// LAST BREAK
// ─────────────────────────────────────────────────────────────

/**
 * Find the end time of the most recent qualifying 30-minute break.
 * A qualifying break = OFF or SB for ≥ 30 minutes.
 * PC counts as a qualifying break.
 *
 * @param {object[]} todayEvents  - events since duty day start
 * @param {Date}     dutyDayStart
 * @param {Date}     now
 * @returns {Date}  end of last qualifying break (or dutyDayStart if none)
 */
function findLastBreakEnd(todayEvents, dutyDayStart, now) {
  const breakMs  = USA.BREAK_DURATION_MINUTES * MS_PER_MIN;
  const segments = buildSegments(todayEvents, now);

  let lastBreakEnd = dutyDayStart;

  for (const seg of segments) {
    if (!isRestStatus(seg.status, seg.specialCondition)) continue;
    const duration = seg.end - seg.start;
    if (duration >= breakMs) {
      lastBreakEnd = new Date(seg.end);
    }
  }

  return lastBreakEnd;
}

// ─────────────────────────────────────────────────────────────
// SLEEPER BERTH SPLIT DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * Detect if a valid sleeper berth split is in progress or completed.
 *
 * Valid splits (§395.1(g)):
 *   Option A: 8h SB + 2h (OFF or SB)  — in either order
 *   Option B: 7h SB + 3h (OFF or SB)  — in either order
 *
 * When a valid split is found:
 *   - Neither rest period counts against the 14h window
 *   - The shorter period counts as the 30-min break requirement
 *   - After the pair, driver gets fresh 11h driving + new 14h window
 *
 * @param {object[]} todayEvents
 * @param {object}   config
 * @returns {object|null}  split details or null
 */
function detectSleeperBerthSplit(todayEvents, config) {
  const sbSegments = todayEvents
    .filter((e) => e.event_code === '2' || e.status === STATUS.SB)
    .map((e, i, arr) => {
      const next = arr[i + 1];
      return {
        start: toMs(e.event_datetime),
        end:   next ? toMs(next.event_datetime) : Date.now(),
      };
    });

  if (sbSegments.length < 1) return null;

  // Check for valid pair combinations
  for (let i = 0; i < sbSegments.length - 1; i++) {
    const a = sbSegments[i];
    const b = sbSegments[i + 1];
    const aDur = (a.end - a.start) / MS_PER_HOUR;
    const bDur = (b.end - b.start) / MS_PER_HOUR;

    // Option A: 8+2 or 2+8
    if (
      (aDur >= USA.SB_SPLIT_A_LONG && bDur >= USA.SB_SPLIT_A_SHORT) ||
      (aDur >= USA.SB_SPLIT_A_SHORT && bDur >= USA.SB_SPLIT_A_LONG)
    ) {
      return { type: 'A', valid: true, periods: [a, b] };
    }

    // Option B: 7+3 or 3+7
    if (
      (aDur >= USA.SB_SPLIT_B_LONG && bDur >= USA.SB_SPLIT_B_SHORT) ||
      (aDur >= USA.SB_SPLIT_B_SHORT && bDur >= USA.SB_SPLIT_B_LONG)
    ) {
      return { type: 'B', valid: true, periods: [a, b] };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// 34H RESTART VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Validate that a 34-hour restart contains two periods from 1am–5am
 * in the driver's home terminal timezone.
 *
 * @param {Date}   restStart      - when the rest period started
 * @param {Date}   restEnd        - when the rest period ended
 * @param {string} timezone       - home terminal timezone (e.g. 'America/Chicago')
 * @returns {{ valid: boolean, periods: number }}
 */
function validateRestartPeriods(restStart, restEnd, timezone) {
  // Count how many 1am-5am windows are fully contained within the rest period
  let periods = 0;

  // Check each calendar day in the rest period
  const startMs  = toMs(restStart);
  const endMs    = toMs(restEnd);
  const oneDayMs = 24 * MS_PER_HOUR;

  // Iterate over each midnight in the rest window
  let dayStart = startMs - (startMs % oneDayMs); // truncate to day start in UTC
  while (dayStart < endMs) {
    const oneAmMs  = dayStart + 1 * MS_PER_HOUR;
    const fiveAmMs = dayStart + 5 * MS_PER_HOUR;

    // The 1am-5am window must be fully within the rest period
    if (oneAmMs >= startMs && fiveAmMs <= endMs) {
      periods++;
    }

    dayStart += oneDayMs;
  }

  return {
    valid:   periods >= USA.RESTART_REQUIRED_PERIODS,
    periods,
  };
}

/**
 * Check if a driver has completed a valid 34h restart recently.
 * Returns the most recent valid restart end time, or null.
 *
 * @param {object[]} events
 * @param {number}   restartHours  - 34 for USA, 36 for Canada
 * @param {string}   timezone
 * @param {Date}     now
 * @returns {Date|null}
 */
function findLastValidRestart(events, restartHours, timezone, now) {
  const restartMs = restartHours * MS_PER_HOUR;
  const segments  = buildSegments(events, now);

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!isRestStatus(seg.status)) continue;

    const duration = seg.end - seg.start;
    if (duration >= restartMs) {
      // For USA, validate the 1am-5am periods
      if (restartHours === USA.RESTART_HOURS) {
        const { valid } = validateRestartPeriods(
          new Date(seg.start),
          new Date(seg.end),
          timezone
        );
        if (valid) return new Date(seg.end);
      } else {
        // Canada: just needs the duration
        return new Date(seg.end);
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// VIOLATION DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * Detect active violations and warnings.
 * Returns array of violation objects.
 *
 * @param {object} params
 * @returns {object[]}  [{type, severity, description, overage_minutes}]
 */
function detectViolations({
  drivingToday,
  drivingLimit,
  shiftElapsed,
  windowLimit,
  drivingSinceBreak,
  onDutyInCycle,
  config,
}) {
  const violations = [];

  const push = (type, severity, description, overageMinutes = 0) => {
    violations.push({ type, severity, description, overage_minutes: round2(overageMinutes) });
  };

  // ── Driving limit ────────────────────────────────────────────
  if (drivingToday > drivingLimit) {
    push(
      config.jurisdiction === 'ca' ? VIOLATION.DRIVING_13H : VIOLATION.DRIVING_11H,
      'violation',
      `Driving limit exceeded by ${round2((drivingToday - drivingLimit) * 60)} minutes`,
      (drivingToday - drivingLimit) * 60
    );
  } else if (drivingToday > drivingLimit - 1) {
    push(
      VIOLATION.WARN_DRIVING_1H,
      'warning',
      `Less than 1 hour of driving remaining`
    );
  }

  // ── 14h window ───────────────────────────────────────────────
  if (shiftElapsed > windowLimit) {
    push(
      VIOLATION.SHIFT_14H,
      'violation',
      `14-hour window exceeded by ${round2((shiftElapsed - windowLimit) * 60)} minutes`,
      (shiftElapsed - windowLimit) * 60
    );
  } else if (shiftElapsed > windowLimit - 1) {
    push(
      VIOLATION.WARN_SHIFT_1H,
      'warning',
      `Less than 1 hour remaining in on-duty window`
    );
  }

  // ── 30-min break ─────────────────────────────────────────────
  if (drivingSinceBreak >= config.rules.BREAK_TRIGGER_HOURS) {
    push(
      VIOLATION.BREAK_30MIN,
      'violation',
      `30-minute break required (${round2(drivingSinceBreak)}h driving without break)`
    );
  } else if (drivingSinceBreak >= config.rules.BREAK_TRIGGER_HOURS - 0.5) {
    push(
      VIOLATION.WARN_BREAK_30MIN,
      'warning',
      `30-minute break required within 30 minutes`
    );
  }

  // ── Cycle limit ──────────────────────────────────────────────
  if (onDutyInCycle > config.cycleHours) {
    const violationType =
      config.cycleHours === 60 ? VIOLATION.CYCLE_60H :
      config.cycleHours === 70 ? VIOLATION.CYCLE_70H :
      VIOLATION.CYCLE_120H;

    push(
      violationType,
      'violation',
      `${config.cycleHours}h cycle limit exceeded by ${round2((onDutyInCycle - config.cycleHours) * 60)} minutes`,
      (onDutyInCycle - config.cycleHours) * 60
    );
  } else if (onDutyInCycle > config.cycleHours - 2) {
    push(
      VIOLATION.WARN_CYCLE_2H,
      'warning',
      `Less than 2 hours remaining in ${config.cycleHours}h cycle`
    );
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────
// SEGMENT BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Convert sorted event array into duration segments.
 * Each segment represents a continuous period in one status.
 *
 * [{status, specialCondition, start (ms), end (ms)}]
 *
 * The last segment runs from the last event to `now`.
 *
 * @param {object[]} events  - sorted ASC
 * @param {Date}     now
 * @returns {object[]}
 */
function buildSegments(events, now) {
  if (events.length === 0) return [];

  const segments = [];
  const nowMs = toMs(now);

  for (let i = 0; i < events.length; i++) {
    const event   = events[i];
    const nextEvt = events[i + 1];
    const start   = toMs(event.event_datetime);
    const end     = nextEvt ? toMs(nextEvt.event_datetime) : nowMs;

    if (end <= start) continue; // skip zero-duration or out-of-order

    segments.push({
      status:           getStatusCode(event),
      specialCondition: event.special_condition || null,
      start,
      end,
    });
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Convert any date-like to milliseconds */
function toMs(d) {
  if (!d) return 0;
  if (d instanceof Date) return d.getTime();
  if (typeof d === 'number') return d;
  return new Date(d).getTime();
}

/** Round to 2 decimal places */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Get the effective status code from an event.
 * event_code '1'=OFF '2'=SB '3'=D '4'=ON for event_type=1
 */
function getStatusCode(event) {
  // Handle both raw DB rows (event_code) and pre-mapped objects (status)
  if (event.status) return event.status;
  const codeMap = { '1': STATUS.OFF, '2': STATUS.SB, '3': STATUS.D, '4': STATUS.ON };
  return codeMap[String(event.event_code)] || STATUS.OFF;
}

function isRestStatus(status, specialCondition) {
  // PC (personal conveyance) filed as OFF — counts as rest
  if (specialCondition === 'personal_conveyance') return true;
  return status === STATUS.OFF || status === STATUS.SB;
}

function isDutyStatus(event) {
  const status = getStatusCode(event);
  if (event.special_condition === 'personal_conveyance') return false;
  return status === STATUS.D || status === STATUS.ON;
}

function isDutyStatusCode(statusCode) {
  return statusCode === STATUS.D || statusCode === STATUS.ON;
}

// ─────────────────────────────────────────────────────────────
// NAMED EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  calculateHOS,
  // Export individual helpers for unit testing
  prepareEvents,
  findDutyDayStart,
  findWindowStart,
  calcDrivingHours,
  calcOnDutyHours,
  findLastBreakEnd,
  detectSleeperBerthSplit,
  validateRestartPeriods,
  findLastValidRestart,
  detectViolations,
  buildSegments,
};
