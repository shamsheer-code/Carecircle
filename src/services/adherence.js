/**
 * Adherence maths.
 *
 * Definition used throughout the app, and stated on the doctor summary so a
 * clinician knows exactly what the number means:
 *
 *   adherence % = taken / (expected - skipped) * 100
 *
 * Doses a clinician told the patient to hold are recorded as `skipped` and
 * removed from the denominator — they are not the patient's failure. Slots
 * still inside their grace window are excluded too, so this morning's
 * not-yet-due tablet cannot drag the number down.
 */

import { dateKey, dateRange, addDays, parse, timeOf, dayOf, DAY_NAMES, timeBucket } from '../utils/date';
import { listScheduledMedications, logsBetween } from '../db/queries';
import { expandDay, graceFor } from './schedule';

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/**
 * @returns {{
 *   from: string, to: string, days: number,
 *   expected: number, taken: number, missed: number, skipped: number, pending: number,
 *   adherence: number|null,
 *   perMedication: Array, byBucket: Array, byWeekday: Array,
 *   daily: Array, weekly: Array,
 *   currentStreak: number, longestStreak: number,
 *   worstMedication: object|null, worstBucket: object|null, worstWeekday: object|null
 * }}
 */
export async function adherenceReport(patientId, days = 30, now = new Date()) {
  const to = dateKey(now);
  const from = dateKey(addDays(now, -(days - 1)));
  const keys = dateRange(from, to);

  const meds = await listScheduledMedications(patientId);
  const logs = await logsBetween(patientId, from, to);
  const byKey = new Map(logs.map((l) => [`${l.medication_id}:${l.scheduled_for}`, l]));

  const medStats = new Map();
  const bucketStats = new Map();
  const weekdayStats = new Map();
  const dailyStats = new Map();

  for (const med of meds) {
    medStats.set(med.id, {
      id: med.id, name: med.name, dose: med.dose, critical: !!med.critical,
      conditionId: med.condition_id, expected: 0, taken: 0, missed: 0, skipped: 0, pending: 0,
      byTime: new Map(),
    });
  }

  let expected = 0, taken = 0, missed = 0, skipped = 0, pending = 0;

  for (const day of keys) {
    dailyStats.set(day, { day, expected: 0, taken: 0, missed: 0, skipped: 0, pending: 0 });

    for (const slot of expandDay(meds, day)) {
      const log = byKey.get(`${slot.medicationId}:${slot.scheduledFor}`);
      const dueAt = parse(slot.scheduledFor).getTime() + graceFor(slot.medication) * 60000;
      const isPending = !log && dueAt > now.getTime();

      const bucket = slot.bucket;
      const weekday = parse(day).getDay();

      if (!bucketStats.has(bucket)) bucketStats.set(bucket, { bucket, expected: 0, taken: 0, missed: 0 });
      if (!weekdayStats.has(weekday)) {
        weekdayStats.set(weekday, { weekday, label: DAY_NAMES[weekday], expected: 0, taken: 0, missed: 0 });
      }

      const m = medStats.get(slot.medicationId);
      const d = dailyStats.get(day);
      const b = bucketStats.get(bucket);
      const w = weekdayStats.get(weekday);
      if (!m.byTime.has(slot.time)) m.byTime.set(slot.time, { time: slot.time, expected: 0, taken: 0, missed: 0 });
      const mt = m.byTime.get(slot.time);

      if (isPending) {
        pending += 1; m.pending += 1; d.pending += 1;
        continue;
      }

      expected += 1; m.expected += 1; d.expected += 1; b.expected += 1; w.expected += 1; mt.expected += 1;

      const status = log ? log.status : 'missed';
      if (status === 'taken') {
        taken += 1; m.taken += 1; d.taken += 1; b.taken += 1; w.taken += 1; mt.taken += 1;
      } else if (status === 'skipped') {
        skipped += 1; m.skipped += 1; d.skipped += 1;
      } else {
        missed += 1; m.missed += 1; d.missed += 1; b.missed += 1; w.missed += 1; mt.missed += 1;
      }
    }
  }

  const perMedication = [...medStats.values()]
    .filter((m) => m.expected > 0)
    .map((m) => ({
      ...m,
      adherence: pct(m.taken, m.expected - m.skipped),
      byTime: [...m.byTime.values()]
        .filter((t) => t.expected > 0)
        .map((t) => ({ ...t, adherence: pct(t.taken, t.expected) }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => (a.adherence ?? 101) - (b.adherence ?? 101));

  const bucketOrder = { Morning: 0, Afternoon: 1, Evening: 2, Night: 3 };
  const byBucket = [...bucketStats.values()]
    .map((b) => ({ ...b, adherence: pct(b.taken, b.expected) }))
    .sort((a, b) => bucketOrder[a.bucket] - bucketOrder[b.bucket]);

  const byWeekday = [...weekdayStats.values()]
    .map((w) => ({ ...w, adherence: pct(w.taken, w.expected) }))
    .sort((a, b) => a.weekday - b.weekday);

  const daily = keys.map((k) => {
    const d = dailyStats.get(k);
    const den = d.expected - d.skipped;
    return { ...d, adherence: den > 0 ? Math.round((d.taken / den) * 100) : null };
  });

  // Streak = consecutive most-recent days with no missed dose (days with
  // nothing expected do not break it).
  let currentStreak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    const d = daily[i];
    if (d.expected === 0) continue;
    if (d.missed === 0) currentStreak += 1;
    else break;
  }
  let longestStreak = 0, running = 0;
  for (const d of daily) {
    if (d.expected === 0) continue;
    if (d.missed === 0) { running += 1; longestStreak = Math.max(longestStreak, running); }
    else running = 0;
  }

  const weekly = groupWeekly(daily);

  const rated = perMedication.filter((m) => m.adherence != null);
  const bucketsRated = byBucket.filter((b) => b.adherence != null && b.expected >= 5);
  const weekdaysRated = byWeekday.filter((w) => w.adherence != null && w.expected >= 3);

  return {
    from, to, days,
    expected, taken, missed, skipped, pending,
    adherence: pct(taken, expected - skipped),
    perMedication, byBucket, byWeekday, daily, weekly,
    currentStreak, longestStreak,
    worstMedication: rated.length ? rated[0] : null,
    worstBucket: bucketsRated.length
      ? bucketsRated.reduce((a, b) => (b.adherence < a.adherence ? b : a)) : null,
    worstWeekday: weekdaysRated.length
      ? weekdaysRated.reduce((a, b) => (b.adherence < a.adherence ? b : a)) : null,
  };
}

function groupWeekly(daily) {
  const weeks = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const expected = chunk.reduce((s, d) => s + d.expected, 0);
    const skipped = chunk.reduce((s, d) => s + d.skipped, 0);
    const taken = chunk.reduce((s, d) => s + d.taken, 0);
    const den = expected - skipped;
    weeks.push({
      label: chunk[0].day,
      from: chunk[0].day,
      to: chunk[chunk.length - 1].day,
      expected, taken, skipped,
      adherence: den > 0 ? Math.round((taken / den) * 100) : null,
    });
  }
  return weeks;
}

/** Adherence over the same window one period earlier — used for trend arrows. */
export async function adherenceTrend(patientId, days = 30, now = new Date()) {
  const current = await adherenceReport(patientId, days, now);
  const priorEnd = addDays(now, -days);
  const prior = await adherenceReport(patientId, days, priorEnd);
  const delta =
    current.adherence != null && prior.adherence != null
      ? Math.round((current.adherence - prior.adherence) * 10) / 10
      : null;
  return { current, prior, delta };
}

/** Commitment score: adherence blended with follow-up attendance and logging effort. */
export function commitmentScore({ adherence, followUpRate, loggingRate }) {
  const parts = [
    { v: adherence, w: 0.6 },
    { v: followUpRate, w: 0.25 },
    { v: loggingRate, w: 0.15 },
  ].filter((p) => p.v != null);
  if (!parts.length) return null;
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  return Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / totalW);
}

export { timeOf, dayOf, timeBucket };
