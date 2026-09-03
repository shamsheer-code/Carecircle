/**
 * The pattern engine behind the Doctor View.
 *
 * The aim is not "here is a wall of data". A doctor gets ten minutes. So this
 * module answers three questions and shows its working for each:
 *
 *   1. Is the patient actually taking the treatment?  (adherence, with the
 *      specific gap named — which drug, which time of day, which weekday)
 *   2. Are the numbers moving in the right direction? (vitals + lab trends)
 *   3. Is there a link between 1 and 2?                (adherence-stratified
 *      vital comparison, so the doctor can tell a control problem apart from
 *      a dosing problem before escalating therapy)
 *
 * Every finding carries `evidence` — the counts it was computed from — so
 * nothing has to be taken on faith.
 */

import { dateKey, addDays, parse, dayOf, fmtShortDate, fmtDate, daysBetween, DAY_NAMES } from '../utils/date';
import { VITAL_TYPES } from '../db/schema';
import {
  listConditions, listMedications, listAppointments, listSymptoms,
  listPanels, panelResults, vitalsSince, getUser,
} from '../db/queries';
import { adherenceReport, adherenceTrend, commitmentScore } from './adherence';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/* ---------------- follow-up behaviour ---------------- */

export function followUpStats(appointments, now = new Date()) {
  const today = dateKey(now);
  const past = appointments.filter((a) => a.scheduled_for <= today);
  const completed = past.filter((a) => a.status === 'completed');
  const missed = past.filter((a) => a.status === 'missed');
  const attendable = completed.length + missed.length;
  const upcoming = appointments
    .filter((a) => a.status === 'scheduled' && a.scheduled_for >= today)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));

  // A follow-up date that has come and gone with no visit booked after it.
  const overdue = completed
    .filter((a) => a.next_followup && a.next_followup < today)
    .filter((a) => !appointments.some((b) => b.scheduled_for >= a.next_followup && b.status !== 'missed' && b.id !== a.id));

  const lastVisit = completed.length
    ? completed.reduce((a, b) => (b.scheduled_for > a.scheduled_for ? b : a)) : null;

  return {
    totalVisits: completed.length,
    missedVisits: missed.length,
    attendanceRate: attendable ? Math.round((completed.length / attendable) * 100) : null,
    upcoming,
    nextVisit: upcoming[0] || null,
    overdueFollowUps: overdue,
    lastVisit,
    daysSinceLastVisit: lastVisit ? daysBetween(lastVisit.scheduled_for, today) : null,
  };
}

/* ---------------- vitals ---------------- */

export function summariseVitals(vitals) {
  const byType = new Map();
  for (const v of vitals) {
    if (!byType.has(v.type)) byType.set(v.type, []);
    byType.get(v.type).push(v);
  }
  const out = [];
  for (const [type, rows] of byType) {
    const meta = VITAL_TYPES[type] || { label: type, unit: '', low: null, high: null, decimals: 1 };
    const values = rows.map((r) => r.value);
    const sorted = [...rows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const half = Math.floor(sorted.length / 2);
    const firstHalf = mean(sorted.slice(0, half).map((r) => r.value));
    const secondHalf = mean(sorted.slice(half).map((r) => r.value));
    const outOfRange = rows.filter(
      (r) => (meta.low != null && r.value < meta.low) || (meta.high != null && r.value > meta.high)
    );
    out.push({
      type,
      label: meta.label,
      unit: meta.unit,
      decimals: meta.decimals,
      count: rows.length,
      mean: r1(mean(values)),
      min: Math.min(...values),
      max: Math.max(...values),
      latest: sorted[sorted.length - 1],
      outOfRangeCount: outOfRange.length,
      outOfRangePct: Math.round((outOfRange.length / rows.length) * 100),
      delta: firstHalf != null && secondHalf != null ? r1(secondHalf - firstHalf) : null,
      series: sorted.map((r) => ({ x: r.recorded_at, y: r.value })),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Compare a vital after days the patient took everything against days they did
 * not. This is the single most useful thing the app can hand a doctor: it
 * separates "the drug is not working" from "the drug is not being taken".
 *
 * The comparison is lagged by one day on purpose. Nearly all home readings are
 * taken in the morning, *before* that day's doses — a fasting glucose at 06:45
 * reflects last night's metformin, and a 07:10 blood pressure reflects
 * yesterday's antihypertensive, not one the patient has not swallowed yet.
 * Stratifying on the same calendar day would compare a reading against doses
 * that had not happened when it was measured.
 */
export function stratifyVitalByAdherence(vitals, daily, type, { lagDays = 1 } = {}) {
  const adherenceByDay = new Map(daily.map((d) => [d.day, d]));
  const full = [];
  const partial = [];
  for (const v of vitals) {
    if (v.type !== type) continue;
    const readingDay = parse(dayOf(v.recorded_at));
    if (!readingDay) continue;
    const d = adherenceByDay.get(dateKey(addDays(readingDay, -lagDays)));
    if (!d || d.expected === 0 || d.adherence == null) continue;
    (d.adherence >= 100 ? full : partial).push(v.value);
  }
  if (full.length < 5 || partial.length < 5) return null;
  const a = mean(full);
  const b = mean(partial);
  return {
    type,
    label: (VITAL_TYPES[type] || {}).label || type,
    unit: (VITAL_TYPES[type] || {}).unit || '',
    lagDays,
    onTrackMean: r1(a),
    onTrackN: full.length,
    missedMean: r1(b),
    missedN: partial.length,
    difference: r1(b - a),
  };
}

/* ---------------- labs ---------------- */

export async function labTrends(patientId) {
  const panels = await listPanels(patientId);
  const byAnalyte = new Map();

  for (const p of panels) {
    const rows = await panelResults(p.id);
    for (const r of rows) {
      if (!byAnalyte.has(r.analyte)) byAnalyte.set(r.analyte, []);
      byAnalyte.get(r.analyte).push({ ...r, collected_on: p.collected_on, panel: p.panel });
    }
  }

  const trends = [];
  for (const [analyte, rows] of byAnalyte) {
    const sorted = rows.sort((a, b) => a.collected_on.localeCompare(b.collected_on));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const outOfRange =
      (last.ref_low != null && last.value < last.ref_low) ||
      (last.ref_high != null && last.value > last.ref_high);
    const flag = !outOfRange ? 'normal' : last.ref_high != null && last.value > last.ref_high ? 'high' : 'low';
    const change = sorted.length > 1 ? r1(last.value - first.value) : null;
    const pctChange =
      sorted.length > 1 && first.value !== 0
        ? r1(((last.value - first.value) / Math.abs(first.value)) * 100) : null;
    trends.push({
      analyte,
      panel: last.panel,
      unit: last.unit,
      refLow: last.ref_low,
      refHigh: last.ref_high,
      latest: last.value,
      latestOn: last.collected_on,
      first: first.value,
      firstOn: first.collected_on,
      n: sorted.length,
      change,
      pctChange,
      direction: change == null || Math.abs(change) < 1e-9 ? 'flat' : change > 0 ? 'up' : 'down',
      flag,
      series: sorted.map((r) => ({ x: r.collected_on, y: r.value })),
    });
  }
  return { panels, trends: trends.sort((a, b) => a.analyte.localeCompare(b.analyte)) };
}

/* ---------------- the findings themselves ---------------- */

export function buildFindings({
  patient, adherence, trend, followUp, vitalSummaries, stratified, labs, symptoms, conditions, medications,
}) {
  const findings = [];
  const push = (f) => findings.push(f);

  /* 1. Headline adherence */
  if (adherence.adherence != null) {
    const a = adherence.adherence;
    const sev = a >= 90 ? 'ok' : a >= 75 ? 'warn' : 'critical';
    push({
      id: 'adherence-overall',
      severity: sev,
      category: 'Adherence',
      headline: `${a}% of scheduled doses taken over ${adherence.days} days`,
      detail:
        sev === 'ok'
          ? 'Treatment is being taken as prescribed. Poor response is unlikely to be an adherence problem.'
          : `${adherence.missed} of ${adherence.expected - adherence.skipped} expected doses were not taken. Consider adherence before escalating therapy.`,
      evidence: [
        `${adherence.taken} taken · ${adherence.missed} missed · ${adherence.skipped} clinically held`,
        trend.delta != null
          ? `${trend.delta >= 0 ? 'Up' : 'Down'} ${Math.abs(trend.delta)} points vs the previous ${adherence.days} days`
          : null,
        `Current run without a missed dose: ${adherence.currentStreak} days (best ${adherence.longestStreak})`,
      ].filter(Boolean),
    });
  }

  /* 2. Which drug */
  const worstMed = adherence.worstMedication;
  if (worstMed && worstMed.adherence != null && worstMed.adherence < 85) {
    const others = adherence.perMedication.filter((m) => m.id !== worstMed.id && m.adherence != null);
    const otherAvg = others.length ? Math.round(mean(others.map((m) => m.adherence))) : null;
    push({
      id: 'adherence-medication',
      severity: worstMed.adherence < 70 || worstMed.critical ? 'critical' : 'warn',
      category: 'Adherence',
      headline: `${worstMed.name} is the weak point at ${worstMed.adherence}%`,
      detail:
        otherAvg != null
          ? `Every other medication averages ${otherAvg}%. The problem is specific to this drug, not general disorganisation — a formulation, timing, or side-effect issue is more likely than forgetfulness.`
          : 'This medication is missed far more often than the rest of the regimen.',
      evidence: [
        `${worstMed.missed} missed of ${worstMed.expected - worstMed.skipped} expected`,
        worstMed.critical ? 'Flagged as critical — missing it has same-day consequences' : null,
        ...worstMed.byTime
          .filter((t) => t.adherence != null)
          .map((t) => `${t.time} slot: ${t.adherence}% (${t.missed} missed of ${t.expected})`),
      ].filter(Boolean),
    });
  }

  /* 3. Which time of day */
  const wb = adherence.worstBucket;
  const bestBucket = adherence.byBucket
    .filter((b) => b.adherence != null && b.expected >= 5)
    .reduce((a, b) => (a == null || b.adherence > a.adherence ? b : a), null);
  if (wb && bestBucket && wb.bucket !== bestBucket.bucket && bestBucket.adherence - wb.adherence >= 15) {
    push({
      id: 'pattern-time-of-day',
      severity: bestBucket.adherence - wb.adherence >= 30 ? 'critical' : 'warn',
      category: 'Pattern',
      headline: `${wb.bucket} doses fail — ${wb.adherence}% vs ${bestBucket.adherence}% in the ${bestBucket.bucket.toLowerCase()}`,
      detail: `A ${Math.round(bestBucket.adherence - wb.adherence)}-point gap by time of day. Consolidating the regimen into the ${bestBucket.bucket.toLowerCase()}, or moving to a once-daily or extended-release form, would likely recover most of the loss without changing the drug.`,
      evidence: adherence.byBucket
        .filter((b) => b.adherence != null)
        .map((b) => `${b.bucket}: ${b.adherence}% (${b.missed} missed of ${b.expected})`),
    });
  }

  /* 4. Which day of the week */
  const ww = adherence.worstWeekday;
  const weekdayRated = adherence.byWeekday.filter((w) => w.adherence != null && w.expected >= 3);
  if (ww && weekdayRated.length >= 5) {
    const rest = weekdayRated.filter((w) => w.weekday !== ww.weekday);
    const restAvg = Math.round(mean(rest.map((w) => w.adherence)));
    if (restAvg - ww.adherence >= 15) {
      const weekendPair = weekdayRated.filter((w) => w.weekday === 0 || w.weekday === 6);
      const weekdayPair = weekdayRated.filter((w) => w.weekday > 0 && w.weekday < 6);
      const weekendAvg = weekendPair.length ? Math.round(mean(weekendPair.map((w) => w.adherence))) : null;
      const weekdayAvg = weekdayPair.length ? Math.round(mean(weekdayPair.map((w) => w.adherence))) : null;
      const isWeekendPattern =
        weekendAvg != null && weekdayAvg != null && weekdayAvg - weekendAvg >= 15;
      push({
        id: 'pattern-weekday',
        severity: restAvg - ww.adherence >= 30 ? 'critical' : 'warn',
        category: 'Pattern',
        headline: isWeekendPattern
          ? `Weekend collapse — ${weekendAvg}% Sat/Sun vs ${weekdayAvg}% Mon–Fri`
          : `${DAY_NAMES[ww.weekday]} is consistently the worst day (${ww.adherence}%)`,
        detail: isWeekendPattern
          ? 'Adherence tracks the caregiving routine rather than the illness. This is a support-availability problem, not a motivation problem — a weekend pill organiser or a second reminder contact addresses it directly.'
          : `Other days average ${restAvg}%. Something specific to ${DAY_NAMES[ww.weekday]} disrupts the routine.`,
        evidence: weekdayRated.map((w) => `${w.label}: ${w.adherence}% (${w.missed} missed of ${w.expected})`),
      });
    }
  }

  /* 5. Adherence <-> outcome link.
     A null result is reported too, and deliberately. "The numbers do not
     improve even when he takes everything" is exactly as useful to a
     prescriber as the opposite finding, and it is the case where escalating
     therapy is actually justified. Suppressing it would leave the doctor to
     assume non-adherence explains everything. */
  const MATERIAL = { systolic: 4, diastolic: 3, glucose_fasting: 8, weight: 0.7 };
  for (const s of stratified) {
    if (!s) continue;
    const threshold = MATERIAL[s.type] ?? 1;
    const material = Math.abs(s.difference) >= threshold;
    const worseWhenMissed = s.difference > 0;
    const lag = s.lagDays ? ` the day after` : ' on days';

    push({
      id: `link-${s.type}`,
      severity: material && worseWhenMissed ? 'warn' : 'info',
      category: 'Correlation',
      headline: !material
        ? `${s.label} is unchanged by whether doses were taken`
        : worseWhenMissed
          ? `${s.label} runs ${Math.abs(s.difference)} ${s.unit} higher${lag} doses are missed`
          : `${s.label} is ${Math.abs(s.difference)} ${s.unit} lower${lag} doses are missed`,
      detail: !material
        ? `No measurable difference over this window (${Math.abs(s.difference)} ${s.unit}, below the ${threshold} ${s.unit} threshold used here). If the target is still not being met, the regimen itself — not adherence — is the more likely explanation.`
        : worseWhenMissed
          ? 'The measured response tracks adherence, which argues the current regimen works when it is actually taken. Closing the dosing gap is worth attempting before adding another agent.'
          : 'The direction is unexpected — readings are better after missed doses. Most likely confounding (readings taken on calmer days, or a measurement-timing artefact) rather than a drug effect. Interpret with care.',
      evidence: [
        `After days all doses taken: mean ${s.onTrackMean} ${s.unit} (n=${s.onTrackN})`,
        `After days with a missed dose: mean ${s.missedMean} ${s.unit} (n=${s.missedN})`,
        `Difference ${s.difference > 0 ? '+' : ''}${s.difference} ${s.unit}; observational and unadjusted`,
      ],
    });
  }

  /* 6. Vitals out of range */
  for (const v of vitalSummaries) {
    if (v.count < 5 || v.outOfRangePct < 25) continue;
    push({
      id: `vital-${v.type}`,
      severity: v.outOfRangePct >= 50 ? 'warn' : 'info',
      category: 'Vitals',
      headline: `${v.label} outside target on ${v.outOfRangePct}% of readings`,
      detail: `Mean ${v.mean} ${v.unit}, range ${v.min}–${v.max}. ${
        v.delta != null && Math.abs(v.delta) >= 1
          ? `Second half of the window is ${v.delta > 0 ? 'higher' : 'lower'} by ${Math.abs(v.delta)} ${v.unit}.`
          : 'No clear drift across the window.'
      }`,
      evidence: [`${v.outOfRangeCount} of ${v.count} readings out of range`],
    });
  }

  /* 7. Labs.
     Severity is graded by how far outside the range the value sits, not merely
     that it is outside. A glucose of 101 against a 70-100 range is a rounding
     error, and calling it critical trains the reader to ignore the word. */
  for (const t of labs.trends) {
    const abnormal = t.flag !== 'normal';
    const moving = t.n > 1 && t.pctChange != null && Math.abs(t.pctChange) >= 8;
    if (!abnormal && !moving) continue;

    // How far past the bound, as a fraction of the reference width.
    const width =
      t.refHigh != null && t.refLow != null ? Math.abs(t.refHigh - t.refLow) : null;
    const excess =
      t.flag === 'high' && t.refHigh != null ? t.latest - t.refHigh
        : t.flag === 'low' && t.refLow != null ? t.refLow - t.latest
          : 0;
    const materiallyOut = width ? excess / width >= 0.1 : excess > 0;

    const worsening =
      abnormal && materiallyOut &&
      ((t.flag === 'high' && t.direction === 'up') || (t.flag === 'low' && t.direction === 'down'));

    push({
      id: `lab-${t.analyte}`,
      severity: worsening ? 'critical' : abnormal ? 'warn' : 'info',
      category: 'Laboratory',
      headline: `${t.analyte} ${t.latest} ${t.unit || ''}${abnormal ? ` — ${t.flag}` : ''}${
        moving ? ` (${t.pctChange > 0 ? '+' : ''}${t.pctChange}% over ${t.n} draws)` : ''
      }`.trim(),
      detail: worsening
        ? `Already out of range and still moving the wrong way: ${t.first} → ${t.latest} between ${fmtShortDate(t.firstOn)} and ${fmtShortDate(t.latestOn)}.`
        : abnormal
          ? `Out of the reference range (${t.refLow ?? '—'}–${t.refHigh ?? '—'} ${t.unit || ''}) as of ${fmtShortDate(t.latestOn)}.`
          : `Within range but shifted ${t.pctChange > 0 ? 'up' : 'down'} ${Math.abs(t.pctChange)}% since ${fmtShortDate(t.firstOn)}.`,
      evidence: t.series.map((s) => `${fmtShortDate(s.x)}: ${s.y} ${t.unit || ''}`.trim()),
    });
  }

  /* 8. Follow-up behaviour */
  if (followUp.attendanceRate != null) {
    const bad = followUp.attendanceRate < 80 || followUp.overdueFollowUps.length > 0;
    push({
      id: 'followup',
      severity: followUp.overdueFollowUps.length > 0 ? 'warn' : bad ? 'warn' : 'ok',
      category: 'Follow-up',
      headline: `${followUp.totalVisits} visits attended, ${followUp.missedVisits} missed (${followUp.attendanceRate}% attendance)`,
      detail: followUp.overdueFollowUps.length
        ? `${followUp.overdueFollowUps.length} follow-up${followUp.overdueFollowUps.length > 1 ? 's are' : ' is'} past due with nothing rebooked.`
        : followUp.nextVisit
          ? `Next appointment ${fmtDate(followUp.nextVisit.scheduled_for)} with ${followUp.nextVisit.doctor_name}.`
          : 'No future appointment on the books.',
      evidence: [
        followUp.lastVisit
          ? `Last seen ${fmtDate(followUp.lastVisit.scheduled_for)} (${followUp.daysSinceLastVisit} days ago)`
          : null,
        ...followUp.overdueFollowUps.map((a) => `Follow-up due ${fmtDate(a.next_followup)} — not booked`),
      ].filter(Boolean),
    });
  }

  /* 9. Red flags */
  const flags = symptoms.filter((s) => s.red_flag);
  if (flags.length) {
    const recent = flags.filter((s) => dayOf(s.noted_at) >= dateKey(addDays(new Date(), -30)));
    const counts = new Map();
    for (const f of flags) counts.set(f.name, (counts.get(f.name) || 0) + 1);
    const recurring = [...counts.entries()].filter(([, n]) => n > 1);
    push({
      id: 'red-flags',
      severity: recent.length ? 'critical' : 'warn',
      category: 'Symptoms',
      headline: `${flags.length} red-flag symptom${flags.length > 1 ? 's' : ''} logged${
        recent.length ? `, ${recent.length} in the last 30 days` : ''
      }`,
      detail: recurring.length
        ? `Recurring: ${recurring.map(([n, c]) => `${n} (×${c})`).join(', ')}. A repeating red flag is a pattern, not an incident.`
        : 'Reviewed individually below.',
      evidence: flags
        .slice(0, 8)
        .map((s) => `${fmtShortDate(dayOf(s.noted_at))} — ${s.name}, severity ${s.severity}/5${s.note ? `: ${s.note}` : ''}`),
    });
  }

  /* 10. Untreated active condition */
  const medConditionIds = new Set(medications.map((m) => m.condition_id).filter(Boolean));
  const untreated = conditions.filter((c) => c.status === 'active' && !medConditionIds.has(c.id));
  if (untreated.length) {
    push({
      id: 'untreated',
      severity: 'info',
      category: 'Treatment plan',
      headline: `${untreated.length} active condition${untreated.length > 1 ? 's have' : ' has'} no linked medication`,
      detail: 'Either managed non-pharmacologically, or the regimen record is incomplete.',
      evidence: untreated.map((c) => `${c.name} — diagnosed ${fmtDate(c.diagnosed_on)}`),
    });
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ---------------- the whole package ---------------- */

/**
 * Everything the Doctor View screen and the PDF need, in one call.
 */
export async function buildPatientSummary(patientId, { days = 90, now = new Date() } = {}) {
  const patient = await getUser(patientId);
  const conditions = await listConditions(patientId);
  const medications = await listMedications(patientId);
  const appointments = await listAppointments(patientId);
  const symptoms = await listSymptoms(patientId);
  const since = dateKey(addDays(now, -(days - 1)));
  const vitals = await vitalsSince(patientId, since);

  const trend = await adherenceTrend(patientId, days, now);
  const adherence = trend.current;
  const followUp = followUpStats(appointments, now);
  const vitalSummaries = summariseVitals(vitals);
  const labs = await labTrends(patientId);

  const stratified = ['systolic', 'diastolic', 'glucose_fasting', 'weight', 'spo2']
    .map((t) => stratifyVitalByAdherence(vitals, adherence.daily, t))
    .filter(Boolean);

  // Rough logging effort: share of days in the window with at least one entry.
  const loggedDays = new Set([
    ...vitals.map((v) => dayOf(v.recorded_at)),
    ...symptoms.map((s) => dayOf(s.noted_at)),
  ]);
  const loggingRate = Math.min(100, Math.round((loggedDays.size / days) * 100));

  const commitment = commitmentScore({
    adherence: adherence.adherence,
    followUpRate: followUp.attendanceRate,
    loggingRate,
  });

  const findings = buildFindings({
    patient, adherence, trend, followUp, vitalSummaries, stratified, labs, symptoms, conditions, medications,
  });

  return {
    patient, conditions, medications, appointments, symptoms,
    adherence, trend, followUp, vitalSummaries, stratified, labs,
    loggingRate, commitment, findings,
    windowDays: days,
    generatedOn: dateKey(now),
    headline: headlineFor(findings, adherence, patient),
  };
}

function headlineFor(findings, adherence, patient) {
  const critical = findings.filter((f) => f.severity === 'critical');
  const name = (patient?.name || 'Patient').split(' ')[0];
  if (!critical.length) {
    return adherence.adherence != null && adherence.adherence >= 90
      ? `${name} is adherent at ${adherence.adherence}% with no critical findings this period.`
      : `No critical findings, but adherence is ${adherence.adherence ?? '—'}%.`;
  }
  return `${critical.length} issue${critical.length > 1 ? 's need' : ' needs'} attention: ${critical
    .slice(0, 2)
    .map((f) => f.headline)
    .join('; ')}.`;
}
