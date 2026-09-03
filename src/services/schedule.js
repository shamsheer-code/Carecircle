/**
 * Turns medication records into concrete dose slots for a given day, and
 * merges them with what was actually logged.
 *
 * A slot's status is derived, never stored, unless a human acted on it:
 *
 *   taken | skipped | missed   -> a row exists in dose_logs
 *   overdue                    -> due time + grace has passed, still no row
 *   due                        -> within the grace window right now
 *   upcoming                   -> still in the future
 *
 * `overdue` is what the sweep in alerts.js converts into a real `missed` row
 * and escalates to the caretaker.
 */

import { parse, dateKey, timeBucket } from '../utils/date';
import { logsForDay, listScheduledMedications } from '../db/queries';

/** How long after the scheduled time a dose stays "still fine to take". */
export const GRACE_MINUTES = { normal: 90, critical: 45 };

export function graceFor(med) {
  return med.critical ? GRACE_MINUTES.critical : GRACE_MINUTES.normal;
}

export function parseTimes(med) {
  try {
    const t = JSON.parse(med.times || '[]');
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

export function parseDays(med) {
  try {
    const d = JSON.parse(med.days_of_week || '[0,1,2,3,4,5,6]');
    return Array.isArray(d) && d.length ? d : [0, 1, 2, 3, 4, 5, 6];
  } catch {
    return [0, 1, 2, 3, 4, 5, 6];
  }
}

/** Is this medication expected on `day` at all? */
export function activeOn(med, day) {
  if (!med.active) return false;
  if (med.is_emergency) return false;
  const d = parse(day);
  if (med.start_date && parse(med.start_date) > d) return false;
  if (med.end_date && parse(med.end_date) < d) return false;
  return parseDays(med).includes(d.getDay());
}

/** Every dose slot a set of medications produces on one day. */
export function expandDay(medications, day) {
  const slots = [];
  for (const med of medications) {
    if (!activeOn(med, day)) continue;
    for (const time of parseTimes(med)) {
      slots.push({
        key: `${med.id}:${day}T${time}`,
        medicationId: med.id,
        medication: med,
        time,
        bucket: timeBucket(time),
        scheduledFor: `${day}T${time}`,
      });
    }
  }
  return slots.sort((a, b) => a.time.localeCompare(b.time));
}

function statusFor(slot, log, at) {
  if (log) return log.status;
  const due = parse(slot.scheduledFor);
  const grace = graceFor(slot.medication) * 60000;
  if (at.getTime() > due.getTime() + grace) return 'overdue';
  if (at.getTime() >= due.getTime()) return 'due';
  return 'upcoming';
}

/** Full picture of one patient's day: slots + resolved status. */
export async function daySchedule(patientId, day = dateKey(), at = new Date()) {
  const meds = await listScheduledMedications(patientId);
  const logs = await logsForDay(patientId, day);
  const byKey = new Map(logs.map((l) => [`${l.medication_id}:${l.scheduled_for}`, l]));

  return expandDay(meds, day).map((slot) => {
    const log = byKey.get(`${slot.medicationId}:${slot.scheduledFor}`);
    return { ...slot, log: log || null, status: statusFor(slot, log, at) };
  });
}

/** Slots that are past their grace window with nothing logged. */
export async function overdueSlots(patientId, day = dateKey(), at = new Date()) {
  const schedule = await daySchedule(patientId, day, at);
  return schedule.filter((s) => s.status === 'overdue');
}

/** Counts used by the header pills on the Today screen. */
export function summarise(schedule) {
  const out = { total: schedule.length, taken: 0, missed: 0, skipped: 0, overdue: 0, due: 0, upcoming: 0 };
  for (const s of schedule) {
    if (out[s.status] != null) out[s.status] += 1;
  }
  out.resolved = out.taken + out.skipped;
  return out;
}

/** Expected dose slots across a date range — the denominator for adherence. */
export function expandRange(medications, dayKeys) {
  const out = [];
  for (const day of dayKeys) out.push(...expandDay(medications, day));
  return out;
}
