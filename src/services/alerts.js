/**
 * The escalation engine — the part that answers the original brief:
 * "today tablet thyroxine taken → notification if taken; if not taken, then
 *  there should be a notification to the caretaker."
 *
 * A dose is not marked missed the instant it is due. It gets a grace window
 * (45 min for critical drugs, 90 for the rest). When that window closes with
 * nothing logged, the sweep:
 *
 *   1. writes a real `missed` row so adherence maths stays honest,
 *   2. raises a de-duplicated alert addressed to the caretaker,
 *   3. fires an OS notification if permission exists.
 *
 * The sweep runs on launch, whenever the app returns to the foreground, and
 * after any dose is logged. It is idempotent — `dedupe_key` makes re-running
 * it harmless.
 */

import { dateKey, addDays, stamp, fmtTime, fmtDate, timeOf, dayOf } from '../utils/date';
import { overdueSlots } from './schedule';
import { adherenceReport } from './adherence';
import { followUpStats } from './patterns';
import { pushEscalation } from './notifications';
import {
  listPatients, listAppointments, listPanels, panelResults,
  createAlert, recordDose, purgeOldAlerts, listSymptoms,
} from '../db/queries';

/** Analytes worth waking the caretaker for. */
const CRITICAL_ANALYTES = {
  Potassium: { low: 3.0, high: 5.5, why: 'risk of arrhythmia' },
  Sodium: { low: 128, high: 150, why: 'risk of neurological symptoms' },
  Creatinine: { low: null, high: 2.0, why: 'significant renal impairment' },
  eGFR: { low: 30, high: null, why: 'advanced kidney disease' },
  HbA1c: { low: null, high: 9.0, why: 'poor long-term glycaemic control' },
  Haemoglobin: { low: 9.0, high: null, why: 'significant anaemia' },
};

/**
 * @returns {{ missedDoses: number, alertsRaised: number }}
 */
export async function runAlertSweep({ notify = true, now = new Date() } = {}) {
  const patients = await listPatients();
  let missedDoses = 0;
  let alertsRaised = 0;

  const raise = async (alert, notification) => {
    const res = await createAlert(alert);
    // INSERT OR IGNORE — changes === 0 means we had already raised this one.
    if (res && res.changes > 0) {
      alertsRaised += 1;
      if (notify && notification) await pushEscalation(notification);
      return true;
    }
    return false;
  };

  for (const patient of patients) {
    /* ---- 1. overdue doses (today and yesterday) ---- */
    const days = [dateKey(addDays(now, -1)), dateKey(now)];
    for (const day of days) {
      const overdue = await overdueSlots(patient.id, day, now);
      for (const slot of overdue) {
        await recordDose({
          medicationId: slot.medicationId,
          patientId: patient.id,
          scheduledFor: slot.scheduledFor,
          status: 'missed',
          recordedBy: null,
        });
        missedDoses += 1;

        const med = slot.medication;
        await raise(
          {
            patient_id: patient.id,
            kind: 'missed_dose',
            severity: med.critical ? 'critical' : 'warn',
            title: `${patient.name} missed ${med.name} ${med.dose}`,
            body: `Due at ${fmtTime(slot.time)}${
              med.critical ? '. This is a critical medication.' : '.'
            }${med.instructions ? ` ${med.instructions}` : ''}`,
            dedupe_key: `missed:${slot.medicationId}:${slot.scheduledFor}`,
            created_at: stamp(now),
          },
          {
            title: med.critical
              ? `Critical dose missed — ${patient.name}`
              : `Dose missed — ${patient.name}`,
            body: `${med.name} ${med.dose}, due ${fmtTime(slot.time)}. Tap to review.`,
            data: { patientId: patient.id, medicationId: med.id, kind: 'missed_dose' },
            critical: !!med.critical,
          }
        );
      }
    }

    /* ---- 2. consecutive misses of the same medication ---- */
    const week = await adherenceReport(patient.id, 7, now);
    for (const med of week.perMedication) {
      if (med.missed >= 3) {
        await raise(
          {
            patient_id: patient.id,
            kind: 'streak',
            severity: med.critical ? 'critical' : 'warn',
            title: `${med.name} missed ${med.missed}× this week`,
            body: `${patient.name} is at ${med.adherence}% on ${med.name} ${med.dose} over the last 7 days. This is no longer a one-off.`,
            dedupe_key: `streak:${med.id}:${dateKey(now)}`,
            created_at: stamp(now),
          },
          {
            title: `${med.name} repeatedly missed`,
            body: `${patient.name}: ${med.missed} misses in 7 days (${med.adherence}%).`,
            data: { patientId: patient.id, kind: 'streak' },
            critical: !!med.critical,
          }
        );
      }
    }

    /* ---- 3. adherence dropping week on week ---- */
    const prior = await adherenceReport(patient.id, 7, addDays(now, -7));
    if (week.adherence != null && prior.adherence != null && prior.adherence - week.adherence >= 15) {
      await raise(
        {
          patient_id: patient.id,
          kind: 'adherence_drop',
          severity: 'warn',
          title: `Adherence fell to ${week.adherence}%`,
          body: `Down from ${prior.adherence}% the week before — a ${Math.round(
            prior.adherence - week.adherence
          )} point drop for ${patient.name}.`,
          dedupe_key: `drop:${patient.id}:${dateKey(now)}`,
          created_at: stamp(now),
        },
        {
          title: `${patient.name}'s adherence is slipping`,
          body: `${week.adherence}% this week vs ${prior.adherence}% last week.`,
          data: { patientId: patient.id, kind: 'adherence_drop' },
        }
      );
    }

    /* ---- 4. follow-ups past due, and visits coming up ---- */
    const appointments = await listAppointments(patient.id);
    const fu = followUpStats(appointments, now);
    for (const a of fu.overdueFollowUps) {
      await raise(
        {
          patient_id: patient.id,
          kind: 'followup_due',
          severity: 'warn',
          title: `Follow-up overdue for ${patient.name}`,
          body: `${a.doctor_name} asked for a review by ${fmtDate(a.next_followup)}. Nothing is booked.`,
          dedupe_key: `followup:${a.id}`,
          created_at: stamp(now),
        },
        {
          title: `Follow-up overdue — ${patient.name}`,
          body: `${a.doctor_name} (${a.specialty || 'review'}) was due ${fmtDate(a.next_followup)}.`,
          data: { patientId: patient.id, kind: 'followup_due' },
        }
      );
    }
    if (fu.nextVisit) {
      const daysAway = Math.round(
        (new Date(fu.nextVisit.scheduled_for).getTime() - now.getTime()) / 86400000
      );
      if (daysAway >= 0 && daysAway <= 2) {
        await raise(
          {
            patient_id: patient.id,
            kind: 'followup_due',
            severity: 'info',
            title: `${patient.name} sees ${fu.nextVisit.doctor_name} ${daysAway === 0 ? 'today' : `in ${daysAway} day${daysAway > 1 ? 's' : ''}`}`,
            body: `${fu.nextVisit.purpose || 'Review'} · ${fmtDate(fu.nextVisit.scheduled_for)}. Export the doctor summary before you go.`,
            dedupe_key: `upcoming:${fu.nextVisit.id}`,
            created_at: stamp(now),
          },
          null
        );
      }
    }

    /* ---- 5. abnormal lab values on the newest panel ----
       Two tiers, deliberately. A value outside its reference range is worth
       telling the caretaker about, but it is not an emergency — potassium 5.3
       against a 3.5–5.1 range needs a phone call to the doctor, not a panic.
       Only the dangerous thresholds in CRITICAL_ANALYTES escalate as critical,
       and those get their own alert each. Everything else is grouped into one
       alert per panel so a routine metabolic panel cannot bury the inbox. */
    const panels = await listPanels(patient.id);
    if (panels.length) {
      const newest = panels[0];
      const rows = await panelResults(newest.id);
      const mildlyAbnormal = [];

      for (const r of rows) {
        const outHigh = r.ref_high != null && r.value > r.ref_high;
        const outLow = r.ref_low != null && r.value < r.ref_low;
        if (!outHigh && !outLow) continue;

        const rule = CRITICAL_ANALYTES[r.analyte];
        const dangerHigh = rule && rule.high != null && r.value > rule.high;
        const dangerLow = rule && rule.low != null && r.value < rule.low;

        if (dangerHigh || dangerLow) {
          await raise(
            {
              patient_id: patient.id,
              kind: 'lab_out_of_range',
              severity: 'critical',
              title: `${r.analyte} ${r.value} ${r.unit || ''} — ${dangerHigh ? 'high' : 'low'}`.trim(),
              body: `${patient.name}, ${newest.panel} collected ${fmtDate(newest.collected_on)}. Reference ${
                r.ref_low ?? '—'
              }–${r.ref_high ?? '—'}. Concern: ${rule.why}. Contact the treating doctor.`,
              dedupe_key: `lab:${r.id}`,
              created_at: stamp(now),
            },
            {
              title: `Abnormal lab — ${patient.name}`,
              body: `${r.analyte} ${r.value} ${r.unit || ''} (${rule.why}).`,
              data: { patientId: patient.id, kind: 'lab_out_of_range' },
              critical: true,
            }
          );
        } else {
          mildlyAbnormal.push({ ...r, direction: outHigh ? 'high' : 'low' });
        }
      }

      if (mildlyAbnormal.length) {
        const list = mildlyAbnormal
          .map((r) => `${r.analyte} ${r.value} ${r.unit || ''} (${r.direction}, ref ${r.ref_low ?? '—'}–${r.ref_high ?? '—'})`)
          .join('; ');
        await raise(
          {
            patient_id: patient.id,
            kind: 'lab_out_of_range',
            severity: 'warn',
            title: `${mildlyAbnormal.length} result${mildlyAbnormal.length > 1 ? 's' : ''} outside range on ${patient.name}'s ${newest.panel}`,
            body: `Collected ${fmtDate(newest.collected_on)}. ${list}. Worth raising at the next review.`,
            dedupe_key: `labpanel:${newest.id}`,
            created_at: stamp(now),
          },
          {
            title: `Lab results outside range — ${patient.name}`,
            body: `${newest.panel}: ${mildlyAbnormal.map((r) => r.analyte).join(', ')}.`,
            data: { patientId: patient.id, kind: 'lab_out_of_range' },
          }
        );
      }
    }
  }

  await purgeOldAlerts();
  return { missedDoses, alertsRaised };
}

/**
 * Called the moment a symptom is saved, so a red flag reaches the caretaker
 * without waiting for the next sweep.
 */
export async function raiseSymptomAlert({ patient, name, severity, note, notedAt, reportedByName }) {
  const isRedFlag = true;
  const res = await createAlert({
    patient_id: patient.id,
    kind: 'red_flag',
    severity: severity >= 4 ? 'critical' : 'warn',
    title: `${patient.name}: ${name}`,
    body: `Severity ${severity}/5${note ? ` — ${note}` : ''}${
      reportedByName ? ` (logged by ${reportedByName})` : ''
    }`,
    dedupe_key: `symptom:${patient.id}:${name}:${notedAt}`,
    created_at: stamp(),
  });
  if (res && res.changes > 0) {
    await pushEscalation({
      title: `Red flag — ${patient.name}`,
      body: `${name}, severity ${severity}/5. Review now.`,
      data: { patientId: patient.id, kind: 'red_flag' },
      critical: severity >= 4,
    });
  }
  return isRedFlag;
}

/** Confirmation ping when a dose is marked taken (the "if taken" half of the brief). */
export async function confirmDoseTaken({ patient, medication, time, byCaretaker }) {
  if (!byCaretaker) return;
  await pushEscalation({
    title: `${patient.name} took ${medication.name}`,
    body: `${medication.dose} logged for the ${fmtTime(time)} dose.`,
    data: { patientId: patient.id, kind: 'dose_taken' },
  });
}

export { timeOf, dayOf, listSymptoms };
