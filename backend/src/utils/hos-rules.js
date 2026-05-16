'use strict';

/**
 * src/utils/hos-rules.js
 *
 * Single source of truth for ALL HOS rule constants.
 * Never hardcode numbers in the calculator — always import from here.
 *
 * Sources:
 *   USA:    49 CFR Part 395 (FMCSA)
 *   Canada: SOR/2019-165 (Transport Canada)
 */

// ─────────────────────────────────────────────────────────────
// STATUS CODES
// ─────────────────────────────────────────────────────────────

const STATUS = {
  OFF: 'OFF',   // Off Duty
  SB:  'SB',    // Sleeper Berth
  D:   'D',     // Driving
  ON:  'ON',    // On Duty (Not Driving)
};

// Special condition annotations (applied to OFF or ON events)
const SPECIAL = {
  PC: 'personal_conveyance',  // subtype of OFF — doesn't count as on-duty
  YM: 'yard_move',            // subtype of ON  — counts as on-duty, NOT driving
};

// Statuses that count as "rest" (off duty or sleeper berth)
const REST_STATUSES  = [STATUS.OFF, STATUS.SB];
// Statuses that count as "on duty" for cycle and 14h window
const DUTY_STATUSES  = [STATUS.D, STATUS.ON];
// All statuses that count toward the 14h on-duty window
const WINDOW_STATUSES = [STATUS.D, STATUS.ON];

// ─────────────────────────────────────────────────────────────
// USA RULES  (49 CFR §395)
// ─────────────────────────────────────────────────────────────

const USA = {

  // §395.3(a)(3)(i) — 11-hour driving limit
  DRIVING_LIMIT_HOURS: 11,

  // §395.3(a)(2) — 14-hour on-duty window
  SHIFT_WINDOW_HOURS: 14,

  // §395.3(a)(3)(ii) — 30-minute break required after 8h driving
  BREAK_TRIGGER_HOURS: 8,
  BREAK_DURATION_MINUTES: 30,

  // §395.3(b)(1) — 10 consecutive hours off duty to reset driving/shift
  RESET_REST_HOURS: 10,

  // Cycle options
  CYCLE_60_HOURS: 60,
  CYCLE_60_DAYS:  7,
  CYCLE_70_HOURS: 70,
  CYCLE_70_DAYS:  8,

  // §395.3(c) — 34-hour restart resets the 60/70h cycle
  RESTART_HOURS: 34,
  // The restart must include two periods from 1am to 5am (home terminal time)
  RESTART_REQUIRED_PERIODS: 2,
  RESTART_PERIOD_START: 1,  // 1:00 AM
  RESTART_PERIOD_END:   5,  // 5:00 AM
  // Can only use the restart once per 168 hours (7 days)
  RESTART_MIN_GAP_HOURS: 168,

  // §395.1(b) — Adverse driving conditions exception
  ADVERSE_EXTRA_DRIVING_HOURS: 2,   // 11 → 13h
  ADVERSE_EXTRA_WINDOW_HOURS:  2,   // 14 → 16h

  // Sleeper Berth splits (§395.1(g))
  // Split option A: 8h SB + 2h OFF/SB
  SB_SPLIT_A_LONG:  8,
  SB_SPLIT_A_SHORT: 2,
  // Split option B: 7h SB + 3h OFF/SB
  SB_SPLIT_B_LONG:  7,
  SB_SPLIT_B_SHORT: 3,
  // Minimum SB period to qualify for split
  SB_MIN_HOURS: 2,
};

// ─────────────────────────────────────────────────────────────
// CANADA RULES  (SOR/2019-165)
// ─────────────────────────────────────────────────────────────

const CANADA = {

  // 13-hour driving limit (vs 11h USA)
  DRIVING_LIMIT_HOURS: 13,

  // 14-hour on-duty window (same as USA)
  SHIFT_WINDOW_HOURS: 14,

  // 30-minute break after 8h driving (same as USA)
  BREAK_TRIGGER_HOURS: 8,
  BREAK_DURATION_MINUTES: 30,

  // 8 consecutive hours off duty to reset (vs 10h USA)
  RESET_REST_HOURS: 8,

  // Cycle options
  CYCLE_1_HOURS: 70,    // Cycle 1: 70h / 7 days
  CYCLE_1_DAYS:  7,
  CYCLE_2_HOURS: 120,   // Cycle 2: 120h / 14 days
  CYCLE_2_DAYS:  14,

  // 36-hour restart (vs 34h USA)
  RESTART_HOURS: 36,

  // Deferral rule: driver may defer up to 2h of driving from day 1 to day 2
  // Must be paid back within the next day
  DEFERRAL_MAX_HOURS: 2,
};

// ─────────────────────────────────────────────────────────────
// CYCLE CONFIG MAP
// Maps the hos_cycle DB value to the applicable rules
// ─────────────────────────────────────────────────────────────

const CYCLE_CONFIG = {
  usa_60: {
    jurisdiction:    'us',
    rules:           USA,
    cycleHours:      USA.CYCLE_60_HOURS,
    cycleDays:       USA.CYCLE_60_DAYS,
    restartHours:    USA.RESTART_HOURS,
    drivingLimit:    USA.DRIVING_LIMIT_HOURS,
    shiftWindow:     USA.SHIFT_WINDOW_HOURS,
    resetRestHours:  USA.RESET_REST_HOURS,
  },
  usa_70: {
    jurisdiction:    'us',
    rules:           USA,
    cycleHours:      USA.CYCLE_70_HOURS,
    cycleDays:       USA.CYCLE_70_DAYS,
    restartHours:    USA.RESTART_HOURS,
    drivingLimit:    USA.DRIVING_LIMIT_HOURS,
    shiftWindow:     USA.SHIFT_WINDOW_HOURS,
    resetRestHours:  USA.RESET_REST_HOURS,
  },
  canada_70: {
    jurisdiction:    'ca',
    rules:           CANADA,
    cycleHours:      CANADA.CYCLE_1_HOURS,
    cycleDays:       CANADA.CYCLE_1_DAYS,
    restartHours:    CANADA.RESTART_HOURS,
    drivingLimit:    CANADA.DRIVING_LIMIT_HOURS,
    shiftWindow:     CANADA.SHIFT_WINDOW_HOURS,
    resetRestHours:  CANADA.RESET_REST_HOURS,
  },
  canada_120: {
    jurisdiction:    'ca',
    rules:           CANADA,
    cycleHours:      CANADA.CYCLE_2_HOURS,
    cycleDays:       CANADA.CYCLE_2_DAYS,
    restartHours:    CANADA.RESTART_HOURS,
    drivingLimit:    CANADA.DRIVING_LIMIT_HOURS,
    shiftWindow:     CANADA.SHIFT_WINDOW_HOURS,
    resetRestHours:  CANADA.RESET_REST_HOURS,
  },
};

// ─────────────────────────────────────────────────────────────
// VIOLATION TYPES
// String constants used in the violations table
// ─────────────────────────────────────────────────────────────

const VIOLATION = {
  DRIVING_11H:        'driving_11h',
  DRIVING_13H:        'driving_13h',
  SHIFT_14H:          'shift_14h',
  BREAK_30MIN:        'break_30min',
  CYCLE_60H:          'cycle_60h',
  CYCLE_70H:          'cycle_70h',
  CYCLE_120H:         'cycle_120h',
  RESTART_INVALID:    'restart_invalid',
  // Warnings (approaching limit)
  WARN_DRIVING_1H:    'warn_driving_1h',
  WARN_SHIFT_1H:      'warn_shift_1h',
  WARN_CYCLE_2H:      'warn_cycle_2h',
  WARN_BREAK_30MIN:   'warn_break_30min',
};

module.exports = {
  STATUS,
  SPECIAL,
  REST_STATUSES,
  DUTY_STATUSES,
  WINDOW_STATUSES,
  USA,
  CANADA,
  CYCLE_CONFIG,
  VIOLATION,
};
