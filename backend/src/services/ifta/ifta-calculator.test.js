'use strict';

/**
 * src/services/ifta/ifta-calculator.test.js
 *
 * Pure-function tests for reverse-geocoder, distance-calculator, and
 * quarterRange. No DB. Run with:
 *
 *   node --test src/services/ifta/ifta-calculator.test.js
 *
 * Uses Node's built-in test runner (node:test) — no test framework
 * dependency required.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { geocode, _reset } = require('./reverse-geocoder.service');
const { haversine, milesBetween, MAX_REASONABLE_GAP_MILES } = require('./distance-calculator.service');
const { quarterRange } = require('./ifta-calculator.service');

// ─────────────────────────────────────────────────────────────
// reverse-geocoder.geocode
// ─────────────────────────────────────────────────────────────

test('geocoder: Manhattan → NY', () => {
  _reset();
  assert.equal(geocode(40.7128, -74.0060), 'NY');
});

test('geocoder: Los Angeles → CA', () => {
  _reset();
  assert.equal(geocode(34.0522, -118.2437), 'CA');
});

test('geocoder: Chicago → IL', () => {
  _reset();
  assert.equal(geocode(41.8781, -87.6298), 'IL');
});

test('geocoder: Portland → OR', () => {
  _reset();
  assert.equal(geocode(45.5, -122.6), 'OR');
});

test('geocoder: ocean (0,0) → null', () => {
  _reset();
  assert.equal(geocode(0, 0), null);
});

test('geocoder: NaN lat → null', () => {
  _reset();
  assert.equal(geocode(NaN, 0), null);
});

test('geocoder: non-number inputs → null', () => {
  _reset();
  assert.equal(geocode(null, undefined), null);
  assert.equal(geocode('x', 'y'), null);
});

test('geocoder: out-of-range coordinates → null', () => {
  _reset();
  assert.equal(geocode(91, 0), null);
  assert.equal(geocode(0, 181), null);
  assert.equal(geocode(-91, 0), null);
});

test('geocoder: consecutive points along route hit cache path', () => {
  _reset();
  // Two close points in Texas — second one should still resolve to TX.
  assert.equal(geocode(31.5, -97.0), 'TX');
  assert.equal(geocode(31.6, -97.1), 'TX');
});

// ─────────────────────────────────────────────────────────────
// distance-calculator
// ─────────────────────────────────────────────────────────────

test('haversine: NY → LA ≈ 2445 miles (±10)', () => {
  // Reference value ≈ 2445 mi great-circle. Tolerance covers earth-radius choice variants.
  const d = haversine(40.7128, -74.0060, 34.0522, -118.2437);
  assert.ok(Math.abs(d - 2445) < 10, `expected ~2445, got ${d}`);
});

test('haversine: same point → 0', () => {
  assert.equal(haversine(0, 0, 0, 0), 0);
  assert.equal(haversine(40.7, -74, 40.7, -74), 0);
});

test('milesBetween: uses odometer delta when sane', () => {
  const prev = { latitude: 40.0, longitude: -74.0, odometer: 100 };
  const curr = { latitude: 40.1, longitude: -74.0, odometer: 150 };
  assert.equal(milesBetween(prev, curr), 50);
});

test('milesBetween: odometer reset → falls back to haversine', () => {
  const prev = { latitude: 40.0, longitude: -74.0, odometer: 1000 };
  const curr = { latitude: 40.1, longitude: -74.0, odometer: 50 };
  const d = milesBetween(prev, curr);
  assert.ok(d > 0 && d < 20, `expected small positive (haversine), got ${d}`);
});

test('milesBetween: gap > 500 miles → 0 (driver off ELD)', () => {
  const prev = { latitude: 40.7, longitude: -74.0 };       // NYC
  const curr = { latitude: 34.0, longitude: -118.0 };       // LA
  assert.equal(milesBetween(prev, curr), 0);
});

test('milesBetween: no odometer → haversine', () => {
  const prev = { latitude: 40.0, longitude: -74.0 };
  const curr = { latitude: 40.1, longitude: -74.0 };
  const d = milesBetween(prev, curr);
  // 0.1 degree of latitude ≈ 6.9 miles
  assert.ok(d > 6 && d < 8, `expected ~6.9, got ${d}`);
});

test('milesBetween: missing/invalid input → 0', () => {
  assert.equal(milesBetween(null, null), 0);
  assert.equal(milesBetween({ latitude: 'x', longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.equal(milesBetween({}, {}), 0);
});

test('milesBetween: odometer as string ("50.5") works', () => {
  const prev = { latitude: 40.0, longitude: -74.0, odometer: '100.0' };
  const curr = { latitude: 40.05, longitude: -74.0, odometer: '110.5' };
  assert.equal(milesBetween(prev, curr), 10.5);
});

test('MAX_REASONABLE_GAP_MILES export sane', () => {
  assert.ok(MAX_REASONABLE_GAP_MILES > 0 && MAX_REASONABLE_GAP_MILES <= 1000);
});

// ─────────────────────────────────────────────────────────────
// quarterRange
// ─────────────────────────────────────────────────────────────

test('quarterRange: 2026 Q1 → Jan 1 .. Apr 1', () => {
  const { start, end } = quarterRange(2026, 1);
  assert.equal(start.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(end.toISOString(),   '2026-04-01T00:00:00.000Z');
});

test('quarterRange: 2026 Q2 → Apr 1 .. Jul 1', () => {
  const { start, end } = quarterRange(2026, 2);
  assert.equal(start.toISOString(), '2026-04-01T00:00:00.000Z');
  assert.equal(end.toISOString(),   '2026-07-01T00:00:00.000Z');
});

test('quarterRange: 2026 Q4 → Oct 1 .. Jan 1 of next year', () => {
  const { start, end } = quarterRange(2026, 4);
  assert.equal(start.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(end.toISOString(),   '2027-01-01T00:00:00.000Z');
});

test('quarterRange: invalid quarter throws', () => {
  assert.throws(() => quarterRange(2026, 0));
  assert.throws(() => quarterRange(2026, 5));
  assert.throws(() => quarterRange(2026, 1.5));
});
