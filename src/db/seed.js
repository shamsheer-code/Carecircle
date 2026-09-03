/**
 * Demo seed: one caretaker, two patients, 90 days of history.
 *
 * The history is not random noise. Each medication carries an adherence
 * *model* that deliberately plants a clinically meaningful pattern, so the
 * analytics engine and the doctor summary have something true to report:
 *
 *   Meera  — near-perfect on the 06:30 thyroxine, but drops off badly on the
 *            20:30 metformin. A time-of-day pattern, with an HbA1c that rises
 *            in step with it.
 *   Ravi   — fine on weekdays, collapses on Saturday and Sunday (his daughter
 *            visits weekdays only). A day-of-week pattern, with Monday morning
 *            blood pressures that run visibly higher.
 *
 * Everything is generated from a fixed-seed PRNG so two installs produce
 * identical data and the numbers in the README stay true.
 */

import { dateKey, stamp, parse, addDays, startOfDay, timeOf } from '../utils/date';

/* ---------- deterministic PRNG (mulberry32) ---------- */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n, p = 0) => Number(n.toFixed(p));

export async function seedIfEmpty(db) {
  const existing = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM users`);
  if (existing && existing.n > 0) return false;
  await seed(db);
  return true;
}

export async function seed(db) {
  const rng = makeRng(20260903);
  const today = startOfDay(new Date());
  const now = stamp(new Date());
  const HISTORY_DAYS = 90;
  const firstDay = addDays(today, -HISTORY_DAYS);

  await db.withTransactionAsync(async () => {
    /* ---------------- users ---------------- */
    const care = await ins(
      db,
      `INSERT INTO users (name, role, pin, color, dob, sex, emergency_contact, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['Anita Rao', 'caretaker', '1111', '#0F766E', '1984-02-11', 'F', '+91 98450 11111', now]
    );

    const meera = await ins(
      db,
      `INSERT INTO users (name, role, pin, color, dob, sex, blood_group, height_cm,
                          emergency_contact, allergies, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        'Meera Nair', 'patient', '2222', '#7C3AED', '1968-06-24', 'F', 'B+', 158,
        'Anita Rao · +91 98450 11111', 'Sulfa drugs (rash)', now,
      ]
    );

    const ravi = await ins(
      db,
      `INSERT INTO users (name, role, pin, color, dob, sex, blood_group, height_cm,
                          emergency_contact, allergies, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        'Ravi Menon', 'patient', '3333', '#0369A1', '1959-11-02', 'M', 'O+', 171,
        'Anita Rao · +91 98450 11111', 'None known', now,
      ]
    );

    /* ---------------- conditions ---------------- */
    const cHypo = await ins(db, CONDITION_SQL, [
      meera, 'Hypothyroidism', 'E03.9', dk(addDays(today, -1400)), 'moderate', 'active',
      'Keep TSH in range on a stable levothyroxine dose; recheck every 3 months.',
      'tsh', 0.4, 4.0, 'Dose steady at 75 mcg since Feb. Must be taken fasting, 30 min before food.',
      care, now,
    ]);

    const cDm = await ins(db, CONDITION_SQL, [
      meera, 'Type 2 Diabetes Mellitus', 'E11.9', dk(addDays(today, -900)), 'moderate', 'active',
      'Bring HbA1c below 7.0% without adding a second agent, by fixing evening dosing.',
      'hba1c', 4.0, 7.0, 'Diet-controlled plus metformin. Evening dose is the weak link.',
      care, now,
    ]);

    const cHtnM = await ins(db, CONDITION_SQL, [
      meera, 'Hypertension', 'I10', dk(addDays(today, -1100)), 'mild', 'active',
      'Home BP under 130/80 on single-agent therapy.',
      'systolic', 90, 130, 'Well controlled on telmisartan 40 mg.',
      care, now,
    ]);

    const cCkd = await ins(db, CONDITION_SQL, [
      ravi, 'Chronic Kidney Disease, Stage 3a', 'N18.3', dk(addDays(today, -730)), 'moderate', 'active',
      'Slow eGFR decline: strict BP control, avoid NSAIDs, monthly metabolic panel.',
      'egfr', 45, 120, 'eGFR drifting down ~1 point per quarter. Nephrology every 3 months.',
      care, now,
    ]);

    const cHtnR = await ins(db, CONDITION_SQL, [
      ravi, 'Hypertension', 'I10', dk(addDays(today, -2000)), 'severe', 'active',
      'Target under 130/80. This is the main lever on his kidney function.',
      'systolic', 90, 130, 'Two agents. Weekend gaps show up as Monday morning spikes.',
      care, now,
    ]);

    const cLipid = await ins(db, CONDITION_SQL, [
      ravi, 'Hyperlipidaemia', 'E78.5', dk(addDays(today, -700)), 'moderate', 'active',
      'LDL under 100 mg/dL on statin therapy.',
      'ldl', 0, 100, 'Atorvastatin 20 mg at night.',
      care, now,
    ]);

    /* ---------------- medications ----------------
       `model` is not stored — it only drives history generation below. */
    const medSpecs = [
      {
        patient: meera, condition: cHypo, name: 'Levothyroxine (Thyroxine)', dose: '75 mcg',
        form: 'tablet', instructions: 'Empty stomach, 30 minutes before breakfast. Do not take with calcium or iron.',
        times: ['06:30'], critical: 1,
        model: { base: 0.96, weekendPenalty: 0.02 },
      },
      {
        patient: meera, condition: cDm, name: 'Metformin', dose: '500 mg',
        form: 'tablet', instructions: 'With breakfast and with dinner. Take after food to avoid nausea.',
        times: ['08:30', '20:30'], critical: 0,
        model: { base: 0.94, byTime: { '20:30': 0.62 }, weekendPenalty: 0.06, driftPerDay: -0.0012 },
      },
      {
        patient: meera, condition: cHtnM, name: 'Telmisartan', dose: '40 mg',
        form: 'tablet', instructions: 'Once daily, morning. Check BP before taking.',
        times: ['09:00'], critical: 0,
        model: { base: 0.9, weekendPenalty: 0.05 },
      },
      {
        patient: meera, condition: cDm, name: 'Glucose gel (rescue)', dose: '15 g',
        form: 'gel', instructions: 'For hypoglycaemia: sugar below 70 mg/dL, shakiness, sweating, confusion. Repeat after 15 min if no better, then call Anita.',
        times: [], isEmergency: 1, critical: 1, model: null,
      },
      {
        patient: ravi, condition: cCkd, name: 'Furosemide', dose: '20 mg',
        form: 'tablet', instructions: 'Morning only. Skipping causes ankle swelling — log weight daily.',
        times: ['08:00'], critical: 1,
        model: { base: 0.93, weekendPenalty: 0.36 },
      },
      {
        patient: ravi, condition: cHtnR, name: 'Amlodipine', dose: '5 mg',
        form: 'tablet', instructions: 'Once daily with breakfast.',
        times: ['09:00'], critical: 0,
        model: { base: 0.92, weekendPenalty: 0.34 },
      },
      {
        patient: ravi, condition: cLipid, name: 'Atorvastatin', dose: '20 mg',
        form: 'tablet', instructions: 'At night. Report any unexplained muscle pain.',
        times: ['21:00'], critical: 0,
        model: { base: 0.86, weekendPenalty: 0.3 },
      },
      {
        patient: ravi, condition: cCkd, name: 'Sodium bicarbonate', dose: '500 mg',
        form: 'tablet', instructions: 'Twice daily with food, to correct metabolic acidosis.',
        times: ['08:00', '20:00'], critical: 0,
        model: { base: 0.88, byTime: { '20:00': 0.74 }, weekendPenalty: 0.3 },
      },
      {
        patient: ravi, condition: cHtnR, name: 'Nitroglycerin (rescue)', dose: '0.4 mg',
        form: 'sublingual', instructions: 'One tablet under the tongue for chest pain. If pain persists after 5 minutes, take a second and call emergency services.',
        times: [], isEmergency: 1, critical: 1, model: null,
      },
    ];

    const meds = [];
    for (const m of medSpecs) {
      const id = await ins(
        db,
        `INSERT INTO medications (patient_id, condition_id, name, dose, form, instructions, times,
                                  days_of_week, start_date, is_emergency, critical, active, recorded_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        [
          m.patient, m.condition, m.name, m.dose, m.form, m.instructions,
          JSON.stringify(m.times), '[0,1,2,3,4,5,6]', dk(addDays(today, -180)),
          m.isEmergency || 0, m.critical || 0, care, now,
        ]
      );
      meds.push({ ...m, id });
    }

    /* ---------------- dose history ----------------
       As each day is generated we remember what was actually missed, because
       the vitals below are derived from it. A demo whose blood pressure moves
       independently of whether the tablets were taken would make the app's
       central claim — that adherence and outcome are linked — undemonstrable. */
    const nowTs = new Date();
    /** `${patientId}:${dayKey}` -> { missed: n, missedMeds: Set<string> } */
    const dayFacts = new Map();
    const factsFor = (patientId, key) => {
      const k = `${patientId}:${key}`;
      if (!dayFacts.has(k)) dayFacts.set(k, { missed: 0, missedMeds: new Set() });
      return dayFacts.get(k);
    };

    for (let i = 0; i < HISTORY_DAYS; i++) {
      const day = addDays(firstDay, i);
      const key = dateKey(day);
      const dow = day.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const daysAgo = HISTORY_DAYS - i;

      for (const med of meds) {
        if (!med.model) continue;
        for (const t of med.times) {
          const scheduled = `${key}T${t}`;
          if (parse(scheduled) > nowTs) continue; // future dose stays pending

          let p = med.model.byTime?.[t] ?? med.model.base;
          if (isWeekend) p -= med.model.weekendPenalty || 0;
          if (med.model.driftPerDay) p += med.model.driftPerDay * (HISTORY_DAYS - daysAgo);
          p = Math.min(0.99, Math.max(0.15, p));

          const roll = rng();
          if (roll < p) {
            const delay = Math.floor(rng() * 25);
            await db.runAsync(
              `INSERT INTO dose_logs (medication_id, patient_id, scheduled_for, status, acted_at, recorded_by)
               VALUES (?,?,?,'taken',?,?)`,
              [med.id, med.patient, scheduled, shift(scheduled, delay), med.patient]
            );
          } else if (roll < p + 0.03) {
            await db.runAsync(
              `INSERT INTO dose_logs (medication_id, patient_id, scheduled_for, status, acted_at, reason, recorded_by)
               VALUES (?,?,?,'skipped',?,?,?)`,
              [med.id, med.patient, scheduled, scheduled, 'Advised to hold by doctor', care]
            );
          } else {
            const facts = factsFor(med.patient, key);
            facts.missed += 1;
            facts.missedMeds.add(`${med.name}@${t}`);
            // Leave the two most recent days unresolved so the missed-dose
            // sweep has live work to do on first launch.
            if (daysAgo > 2) {
              await db.runAsync(
                `INSERT INTO dose_logs (medication_id, patient_id, scheduled_for, status, recorded_by)
                 VALUES (?,?,?,'missed',?)`,
                [med.id, med.patient, scheduled, null]
              );
            }
          }
        }
      }
    }

    /* ---------------- vitals ----------------
       Morning readings are a consequence of the day before. Each reading is
       generated from that day's actual dose record, so the correlation the
       Doctor View reports is genuinely present in the data rather than
       asserted by the copy.

       Note what this means for the seeded story: Ravi's Monday blood pressure
       is high because his Saturday and Sunday doses were missed, not because
       Monday was hard-coded to be high. The weekday pattern *emerges*. */
    const missedOn = (patientId, key) => dayFacts.get(`${patientId}:${key}`) || { missed: 0, missedMeds: new Set() };

    for (let i = 0; i < HISTORY_DAYS; i++) {
      const day = addDays(firstDay, i);
      const key = dateKey(day);
      const dow = day.getDay();
      if (parse(`${key}T08:00`) > nowTs) continue;

      const prevKey = dateKey(addDays(day, -1));

      /* --- Meera --- */
      const mToday = missedOn(meera, key);
      const mPrev = missedOn(meera, prevKey);

      if (rng() < 0.8) {
        // Telmisartan is a morning dose, so today's reading is taken before it
        // and reflects yesterday's cover.
        const bpPenalty = mPrev.missedMeds.has('Telmisartan@09:00') ? 9 : mPrev.missed > 0 ? 3 : 0;
        await v(db, meera, 'systolic', round(121 + bpPenalty + (rng() - 0.5) * 8), 'mmHg', `${key}T07:10`, meera);
        await v(db, meera, 'diastolic', round(76 + bpPenalty * 0.55 + (rng() - 0.5) * 6), 'mmHg', `${key}T07:10`, meera);
        await v(db, meera, 'pulse', round(74 + (rng() - 0.5) * 10), 'bpm', `${key}T07:10`, meera);
      }

      if (rng() < 0.55) {
        // Fasting sugar is read before breakfast, so it is governed by last
        // night's metformin. This is the link that explains her rising HbA1c.
        const eveningMissed = mPrev.missedMeds.has('Metformin@20:30');
        const drift = (i / HISTORY_DAYS) * 14;
        await v(
          db, meera, 'glucose_fasting',
          round(114 + drift + (eveningMissed ? 26 : 0) + (rng() - 0.5) * 12),
          'mg/dL', `${key}T06:45`, meera
        );
      }

      if (dow === 1) {
        await v(db, meera, 'weight', round(68.4 + (rng() - 0.5) * 1.2, 1), 'kg', `${key}T07:00`, meera);
      }

      /* --- Ravi --- */
      const rPrev = missedOn(ravi, prevKey);
      const rPrev2 = missedOn(ravi, dateKey(addDays(day, -2)));

      if (rng() < 0.88) {
        // Two antihypertensives; missing either shows up the next morning, and
        // two bad days in a row compound.
        const missedBp =
          (rPrev.missedMeds.has('Amlodipine@09:00') ? 7 : 0) +
          (rPrev2.missedMeds.has('Amlodipine@09:00') ? 4 : 0) +
          (rPrev.missed > 0 ? 3 : 0);
        await v(db, ravi, 'systolic', round(129 + missedBp + (rng() - 0.5) * 9), 'mmHg', `${key}T08:20`, care);
        await v(db, ravi, 'diastolic', round(81 + missedBp * 0.5 + (rng() - 0.5) * 6), 'mmHg', `${key}T08:20`, care);
        await v(db, ravi, 'pulse', round(70 + (rng() - 0.5) * 9), 'bpm', `${key}T08:20`, care);
      }

      if (rng() < 0.7) {
        // Furosemide is a diuretic: skip it and fluid is retained overnight.
        const fluid =
          (rPrev.missedMeds.has('Furosemide@08:00') ? 0.9 : 0) +
          (rPrev2.missedMeds.has('Furosemide@08:00') ? 0.5 : 0);
        await v(db, ravi, 'weight', round(78.8 + fluid + (rng() - 0.5) * 0.5, 1), 'kg', `${key}T08:00`, care);
      }

      if (rng() < 0.3) {
        const strain = rPrev.missedMeds.has('Furosemide@08:00') ? -1 : 0;
        await v(db, ravi, 'spo2', round(97 + strain + rng()), '%', `${key}T08:30`, care);
      }
    }

    /* ---------------- lab panels ---------------- */
    // Meera — monthly BMP, quarterly thyroid and diabetes panels.
    const meeraBmp = [
      { at: -84, na: 139, k: 4.2, cl: 103, hco3: 25, bun: 14, cr: 0.82, glu: 132, ca: 9.3, egfr: 78 },
      { at: -56, na: 140, k: 4.1, cl: 102, hco3: 26, bun: 15, cr: 0.85, glu: 141, ca: 9.2, egfr: 76 },
      { at: -28, na: 138, k: 4.4, cl: 104, hco3: 25, bun: 16, cr: 0.84, glu: 149, ca: 9.4, egfr: 77 },
      { at: -4, na: 139, k: 4.3, cl: 103, hco3: 24, bun: 15, cr: 0.86, glu: 156, ca: 9.3, egfr: 75 },
    ];
    for (const p of meeraBmp) {
      const pid = await ins(db, PANEL_SQL, [meera, 'Basic Metabolic Panel', dk(addDays(today, p.at)), 'Metropolis Labs', care, null]);
      await results(db, pid, [
        ['Sodium', p.na, 'mmol/L', 135, 145], ['Potassium', p.k, 'mmol/L', 3.5, 5.1],
        ['Chloride', p.cl, 'mmol/L', 98, 107], ['Bicarbonate', p.hco3, 'mmol/L', 22, 29],
        ['BUN', p.bun, 'mg/dL', 7, 20], ['Creatinine', p.cr, 'mg/dL', 0.6, 1.3],
        ['Glucose', p.glu, 'mg/dL', 70, 100], ['Calcium', p.ca, 'mg/dL', 8.6, 10.3],
        ['eGFR', p.egfr, 'mL/min/1.73m²', 60, 120],
      ]);
    }
    for (const [at, tsh, ft4] of [[-84, 2.4, 1.2], [-4, 2.7, 1.1]]) {
      const pid = await ins(db, PANEL_SQL, [meera, 'Thyroid Panel', dk(addDays(today, at)), 'Metropolis Labs', care, null]);
      await results(db, pid, [['TSH', tsh, 'mIU/L', 0.4, 4.0], ['Free T4', ft4, 'ng/dL', 0.8, 1.8]]);
    }
    // The story: HbA1c climbing while evening metformin adherence falls.
    for (const [at, a1c, fg] of [[-84, 6.9, 128], [-4, 7.8, 152]]) {
      const pid = await ins(db, PANEL_SQL, [meera, 'Diabetes Panel', dk(addDays(today, at)), 'Metropolis Labs', care, null]);
      await results(db, pid, [['HbA1c', a1c, '%', 4.0, 5.7], ['Fasting glucose', fg, 'mg/dL', 70, 100]]);
    }

    // Ravi — monthly BMP with a slow eGFR decline.
    const raviBmp = [
      { at: -86, na: 138, k: 4.6, cl: 104, hco3: 21, bun: 28, cr: 1.62, glu: 96, ca: 9.0, egfr: 45 },
      { at: -58, na: 137, k: 4.8, cl: 105, hco3: 20, bun: 30, cr: 1.68, glu: 99, ca: 8.9, egfr: 43 },
      { at: -30, na: 139, k: 5.0, cl: 106, hco3: 21, bun: 31, cr: 1.71, glu: 94, ca: 8.8, egfr: 42 },
      { at: -6, na: 138, k: 5.3, cl: 107, hco3: 19, bun: 34, cr: 1.79, glu: 101, ca: 8.7, egfr: 40 },
    ];
    for (const p of raviBmp) {
      const pid = await ins(db, PANEL_SQL, [ravi, 'Basic Metabolic Panel', dk(addDays(today, p.at)), 'Apollo Diagnostics', care, null]);
      await results(db, pid, [
        ['Sodium', p.na, 'mmol/L', 135, 145], ['Potassium', p.k, 'mmol/L', 3.5, 5.1],
        ['Chloride', p.cl, 'mmol/L', 98, 107], ['Bicarbonate', p.hco3, 'mmol/L', 22, 29],
        ['BUN', p.bun, 'mg/dL', 7, 20], ['Creatinine', p.cr, 'mg/dL', 0.6, 1.3],
        ['Glucose', p.glu, 'mg/dL', 70, 100], ['Calcium', p.ca, 'mg/dL', 8.6, 10.3],
        ['eGFR', p.egfr, 'mL/min/1.73m²', 60, 120],
      ]);
    }
    for (const [at, tc, ldl, hdl, tg] of [[-86, 212, 128, 41, 190], [-6, 186, 104, 44, 162]]) {
      const pid = await ins(db, PANEL_SQL, [ravi, 'Lipid Panel', dk(addDays(today, at)), 'Apollo Diagnostics', care, null]);
      await results(db, pid, [
        ['Total cholesterol', tc, 'mg/dL', 0, 200], ['LDL', ldl, 'mg/dL', 0, 100],
        ['HDL', hdl, 'mg/dL', 40, 90], ['Triglycerides', tg, 'mg/dL', 0, 150],
      ]);
    }

    /* ---------------- appointments ---------------- */
    const appts = [
      [meera, cHypo, 'Dr. S. Krishnan', 'Endocrinology', dk(addDays(today, -82)), 'Quarterly thyroid review', 'completed', 'TSH in range. Continue 75 mcg. Stressed the fasting rule.', dk(addDays(today, -2))],
      [meera, cDm, 'Dr. S. Krishnan', 'Endocrinology', dk(addDays(today, -54)), 'Diabetes review', 'completed', 'HbA1c 7.1%. Hold on second agent; fix evening dosing first.', dk(addDays(today, -2))],
      [meera, cHtnM, 'Dr. P. Iyer', 'General Medicine', dk(addDays(today, -33)), 'BP check', 'missed', null, null],
      [meera, cDm, 'Dr. S. Krishnan', 'Endocrinology', dk(addDays(today, -2)), 'Quarterly review with fresh labs', 'completed', 'HbA1c up to 7.8%. Reviewing adherence data before escalating therapy. Recheck in 6 weeks.', dk(addDays(today, 40))],
      [meera, cDm, 'Dr. S. Krishnan', 'Endocrinology', dk(addDays(today, 40)), 'Decide on second agent', 'scheduled', null, null],

      [ravi, cCkd, 'Dr. A. Balakrishnan', 'Nephrology', dk(addDays(today, -88)), 'CKD staging review', 'completed', 'eGFR 45. Strict BP control. Avoid NSAIDs entirely.', dk(addDays(today, -6))],
      [ravi, cHtnR, 'Dr. P. Iyer', 'General Medicine', dk(addDays(today, -60)), 'BP titration', 'completed', 'Added amlodipine 5 mg. Home readings twice daily.', null],
      [ravi, cCkd, 'Dr. A. Balakrishnan', 'Nephrology', dk(addDays(today, -25)), 'Interim renal review', 'missed', null, null],
      [ravi, cCkd, 'Dr. A. Balakrishnan', 'Nephrology', dk(addDays(today, -6)), 'Quarterly renal review', 'completed', 'eGFR 40, potassium 5.3 — watch closely. Dietary potassium restriction. Repeat panel in 4 weeks.', dk(addDays(today, 22))],
      [ravi, cCkd, 'Dr. A. Balakrishnan', 'Nephrology', dk(addDays(today, 22)), 'Repeat metabolic panel review', 'scheduled', null, null],
      [ravi, cLipid, 'Dr. P. Iyer', 'General Medicine', dk(addDays(today, 9)), 'Lipid recheck', 'scheduled', null, null],
    ];
    for (const a of appts) {
      await db.runAsync(
        `INSERT INTO appointments (patient_id, condition_id, doctor_name, specialty, scheduled_for,
                                   purpose, status, outcome, next_followup, recorded_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [...a, care]
      );
    }

    /* ---------------- symptoms ---------------- */
    const symptoms = [
      [meera, 'Fatigue', 3, 0, -46, 'Worse in the afternoons this week.', meera],
      [meera, 'Tingling in feet', 2, 0, -30, 'Both feet, mostly at night.', meera],
      [meera, 'Dizziness', 2, 0, -19, 'Stood up too fast after lunch.', meera],
      [meera, 'Fatigue', 4, 0, -8, 'Slept 9 hours and still tired.', care],
      [meera, 'Low appetite', 2, 0, -3, null, meera],
      [ravi, 'Swelling of face or ankles', 4, 1, -52, 'Both ankles puffy after a weekend of missed water tablets.', care],
      [ravi, 'Muscle cramps', 3, 0, -35, 'Calves, at night.', ravi],
      [ravi, 'Breathlessness at rest', 3, 1, -21, 'Climbing one flight left him winded. Settled after 10 minutes.', care],
      [ravi, 'Fatigue', 3, 0, -12, null, ravi],
      [ravi, 'Swelling of face or ankles', 3, 1, -2, 'Ankles again this Monday. Weight up 1.1 kg since Friday.', care],
    ];
    for (const [pid, name, sev, flag, at, note, by] of symptoms) {
      await db.runAsync(
        `INSERT INTO symptoms (patient_id, name, severity, red_flag, noted_at, note, recorded_by)
         VALUES (?,?,?,?,?,?,?)`,
        [pid, name, sev, flag, `${dk(addDays(today, at))}T19:30`, note, by]
      );
    }
  });
}

/* ---------- small helpers ---------- */

const CONDITION_SQL = `
  INSERT INTO conditions (patient_id, name, icd_hint, diagnosed_on, severity, status,
                          treatment_goal, target_metric, target_low, target_high, notes, recorded_by, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const PANEL_SQL = `
  INSERT INTO lab_panels (patient_id, panel, collected_on, lab_name, recorded_by, note)
  VALUES (?,?,?,?,?,?)`;

async function ins(db, sql, params) {
  const res = await db.runAsync(sql, params);
  return res.lastInsertRowId;
}

async function v(db, patient, type, value, unit, at, by) {
  await db.runAsync(
    `INSERT INTO vitals (patient_id, type, value, unit, recorded_at, recorded_by) VALUES (?,?,?,?,?,?)`,
    [patient, type, value, unit, at, by]
  );
}

async function results(db, panelId, rows) {
  for (const [analyte, value, unit, lo, hi] of rows) {
    await db.runAsync(
      `INSERT INTO lab_results (panel_id, analyte, value, unit, ref_low, ref_high) VALUES (?,?,?,?,?,?)`,
      [panelId, analyte, value, unit, lo, hi]
    );
  }
}

const dk = (d) => dateKey(d);

/** Add `mins` to a 'YYYY-MM-DDTHH:MM' string. */
function shift(ts, mins) {
  const d = parse(ts);
  d.setMinutes(d.getMinutes() + mins);
  return stamp(d);
}

export { timeOf };
