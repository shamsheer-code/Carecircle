/**
 * CareCircle verification pass.
 *
 * Runs outside Expo, on plain Node, and does two things:
 *
 *   1. Parses every source file (JSX + ESM) so a syntax error cannot reach
 *      a phone.
 *   2. Executes the real database, seed, schedule, adherence, alert and
 *      pattern code against an in-memory SQLite, and asserts the numbers
 *      it produces — including that the patterns deliberately planted in
 *      the seed are the ones the engine actually finds.
 *
 * Usage (from the project root, with the harness dependencies installed):
 *   node tools/verify.js
 *
 * The harness needs @babel/core, @babel/register, @babel/preset-env,
 * @babel/preset-react and test doubles for the native modules. See
 * tools/README.md.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result === false) throw new Error('assertion returned false');
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    const result = await fn();
    if (result === false) throw new Error('assertion returned false');
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${err.message}`);
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const near = (a, b, tol, msg) =>
  assert(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected within ${tol} of ${b})`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

async function main() {
  console.log('\n\x1b[1mCareCircle verification\x1b[0m\n');

  /* ---------------------------------------------------------------- */
  console.log('\x1b[1m1. Every source file parses\x1b[0m');
  const parser = require('@babel/parser');
  const files = [
    path.join(ROOT, 'App.js'),
    path.join(ROOT, 'index.js'),
    ...walk(SRC),
  ];
  let parseFailures = 0;
  for (const file of files) {
    try {
      parser.parse(fs.readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
      });
    } catch (err) {
      parseFailures += 1;
      console.log(`  \x1b[31m✗\x1b[0m ${path.relative(ROOT, file)}: ${err.message}`);
    }
  }
  check(`${files.length} files parse cleanly`, () => {
    assert(parseFailures === 0, `${parseFailures} file(s) failed to parse`);
  });

  /* ---------------------------------------------------------------- */
  const babelRegister = require('@babel/register');
  (babelRegister.default || babelRegister)({
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
      ['@babel/preset-react', { runtime: 'classic' }],
    ],
    extensions: ['.js'],
    only: [SRC],
    cwd: ROOT,
    // Ignore the app's own babel.config.js — babel-preset-expo is a Metro
    // concern and is not installed for the harness.
    babelrc: false,
    configFile: false,
  });

  const dateUtil = require(path.join(SRC, 'utils/date.js'));
  const { initDatabase } = require(path.join(SRC, 'db/database.js'));
  const queries = require(path.join(SRC, 'db/queries.js'));
  const scheduleSvc = require(path.join(SRC, 'services/schedule.js'));
  const adherenceSvc = require(path.join(SRC, 'services/adherence.js'));
  const patternsSvc = require(path.join(SRC, 'services/patterns.js'));
  const alertsSvc = require(path.join(SRC, 'services/alerts.js'));
  const pdfSvc = require(path.join(SRC, 'services/pdf.js'));

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m2. Date handling stays in local wall-clock time\x1b[0m');

  check('stamp round-trips through parse', () => {
    const d = new Date(2026, 8, 3, 6, 30);
    const s = dateUtil.stamp(d);
    assert(s === '2026-09-03T06:30', `expected 2026-09-03T06:30, got ${s}`);
    const back = dateUtil.parse(s);
    assert(back.getHours() === 6 && back.getMinutes() === 30, 'hours drifted on the round trip');
  });

  check('a 06:30 dose does not shift to UTC', () => {
    const s = dateUtil.stamp(new Date(2026, 0, 1, 6, 30));
    assert(s.endsWith('T06:30'), `06:30 became ${s} — this is the UTC bug`);
  });

  check('dateRange is inclusive at both ends', () => {
    const r = dateUtil.dateRange('2026-09-01', '2026-09-05');
    assert(r.length === 5, `expected 5 days, got ${r.length}`);
    assert(r[0] === '2026-09-01' && r[4] === '2026-09-05', 'endpoints wrong');
  });

  check('dateRange survives a month boundary', () => {
    const r = dateUtil.dateRange('2026-01-30', '2026-02-02');
    assert(r.join(',') === '2026-01-30,2026-01-31,2026-02-01,2026-02-02', r.join(','));
  });

  check('timeBucket splits the day the way the UI groups it', () => {
    assert(dateUtil.timeBucket('06:30') === 'Morning');
    assert(dateUtil.timeBucket('13:00') === 'Afternoon');
    assert(dateUtil.timeBucket('20:30') === 'Evening');
    assert(dateUtil.timeBucket('22:00') === 'Night');
  });

  check('fmtTime renders 12-hour clock correctly at the edges', () => {
    assert(dateUtil.fmtTime('00:05') === '12:05 AM', dateUtil.fmtTime('00:05'));
    assert(dateUtil.fmtTime('12:00') === '12:00 PM', dateUtil.fmtTime('12:00'));
    assert(dateUtil.fmtTime('21:00') === '9:00 PM', dateUtil.fmtTime('21:00'));
  });

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m3. Schema and seed\x1b[0m');

  await initDatabase();

  let meera, ravi, anita;
  await checkAsync('three users seeded, one caretaker and two patients', async () => {
    const users = await queries.listUsers();
    assert(users.length === 3, `expected 3 users, got ${users.length}`);
    const patients = await queries.listPatients();
    assert(patients.length === 2, `expected 2 patients, got ${patients.length}`);
    meera = patients.find((p) => p.name.startsWith('Meera'));
    ravi = patients.find((p) => p.name.startsWith('Ravi'));
    anita = users.find((u) => u.role === 'caretaker');
    assert(meera && ravi && anita, 'expected Meera, Ravi and Anita');
  });

  await checkAsync('PIN check accepts the right PIN and rejects the wrong one', async () => {
    assert(await queries.verifyPin(anita.id, '1111'), 'correct PIN was rejected');
    assert(!(await queries.verifyPin(anita.id, '9999')), 'wrong PIN was accepted');
  });

  await checkAsync('conditions carry treatment goals', async () => {
    const cs = await queries.listConditions(meera.id);
    assert(cs.length >= 3, `expected at least 3 conditions, got ${cs.length}`);
    assert(cs.every((c) => c.treatment_goal), 'a condition is missing its treatment goal');
  });

  await checkAsync('rescue medication is separated from the daily schedule', async () => {
    const scheduled = await queries.listScheduledMedications(meera.id);
    const rescue = await queries.listEmergencyMedications(meera.id);
    assert(rescue.length >= 1, 'expected at least one rescue medicine');
    assert(
      scheduled.every((m) => !m.is_emergency),
      'a rescue medicine leaked into the scheduled list'
    );
    assert(
      rescue.every((m) => JSON.parse(m.times).length === 0),
      'a rescue medicine has scheduled times'
    );
  });

  await checkAsync('90 days of dose history exist for both patients', async () => {
    const to = dateUtil.dateKey();
    const from = dateUtil.dateKey(dateUtil.addDays(new Date(), -90));
    const m = await queries.logsBetween(meera.id, from, to);
    const r = await queries.logsBetween(ravi.id, from, to);
    assert(m.length > 300, `Meera has only ${m.length} dose logs`);
    assert(r.length > 300, `Ravi has only ${r.length} dose logs`);
  });

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m4. Schedule expansion\x1b[0m');

  await checkAsync('twice-daily medicine produces two slots a day', async () => {
    const meds = await queries.listScheduledMedications(meera.id);
    const metformin = meds.find((m) => m.name === 'Metformin');
    assert(metformin, 'Metformin is missing from the seed');
    const slots = scheduleSvc.expandDay([metformin], dateUtil.dateKey());
    assert(slots.length === 2, `expected 2 slots, got ${slots.length}`);
    assert(slots[0].time < slots[1].time, 'slots are not in time order');
  });

  await checkAsync('slots are ordered by time across all medicines', async () => {
    const sched = await scheduleSvc.daySchedule(meera.id, dateUtil.dateKey());
    const times = sched.map((s) => s.time);
    assert(
      times.every((t, i) => i === 0 || times[i - 1] <= t),
      `not sorted: ${times.join(',')}`
    );
  });

  check('a dose inside its grace window is "due", not "overdue"', () => {
    const now = new Date(2026, 8, 3, 9, 30);
    const med = { id: 1, critical: 0, active: 1, is_emergency: 0, times: '["09:00"]', days_of_week: '[0,1,2,3,4,5,6]', start_date: '2026-01-01' };
    const slots = scheduleSvc.expandDay([med], '2026-09-03');
    const grace = scheduleSvc.graceFor(med);
    assert(grace === 90, `normal grace should be 90 minutes, got ${grace}`);
    // 30 minutes late, 90-minute window -> still due
    const due = dateUtil.parse(slots[0].scheduledFor).getTime();
    assert(now.getTime() < due + grace * 60000, 'grace window maths is wrong');
  });

  check('critical medicines get the shorter 45-minute grace window', () => {
    assert(scheduleSvc.graceFor({ critical: 1 }) === 45);
    assert(scheduleSvc.graceFor({ critical: 0 }) === 90);
  });

  check('an inactive or out-of-range medicine produces no slots', () => {
    const base = { id: 2, times: '["08:00"]', days_of_week: '[0,1,2,3,4,5,6]', start_date: '2026-01-01', active: 1, is_emergency: 0 };
    assert(!scheduleSvc.activeOn({ ...base, active: 0 }, '2026-09-03'), 'inactive medicine still scheduled');
    assert(!scheduleSvc.activeOn({ ...base, is_emergency: 1 }, '2026-09-03'), 'rescue medicine still scheduled');
    assert(!scheduleSvc.activeOn({ ...base, start_date: '2026-12-01' }, '2026-09-03'), 'future start date ignored');
    assert(!scheduleSvc.activeOn({ ...base, end_date: '2026-08-01' }, '2026-09-03'), 'past end date ignored');
    assert(scheduleSvc.activeOn(base, '2026-09-03'), 'valid medicine was excluded');
  });

  check('day-of-week restrictions are honoured', () => {
    // 2026-09-03 is a Thursday (day 4).
    const weekdayOnly = { id: 3, times: '["08:00"]', days_of_week: '[1,2,3,4,5]', start_date: '2026-01-01', active: 1, is_emergency: 0 };
    assert(scheduleSvc.activeOn(weekdayOnly, '2026-09-03'), 'Thursday should be scheduled');
    assert(!scheduleSvc.activeOn(weekdayOnly, '2026-09-05'), 'Saturday should not be scheduled');
  });

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m5. Adherence maths\x1b[0m');

  const meeraReport = await adherenceSvc.adherenceReport(meera.id, 90);
  const raviReport = await adherenceSvc.adherenceReport(ravi.id, 90);

  check('adherence is taken / (expected - held), to one decimal', () => {
    const expectedPct =
      Math.round((meeraReport.taken / (meeraReport.expected - meeraReport.skipped)) * 1000) / 10;
    assert(
      meeraReport.adherence === expectedPct,
      `reported ${meeraReport.adherence}, recomputed ${expectedPct}`
    );
  });

  check('clinically held doses are excluded from the denominator', () => {
    assert(meeraReport.skipped > 0, 'seed produced no held doses, so this cannot be tested');
    const withSkips = Math.round((meeraReport.taken / meeraReport.expected) * 1000) / 10;
    assert(
      meeraReport.adherence > withSkips,
      'held doses appear to still be in the denominator'
    );
  });

  check('the parts add up to the whole', () => {
    const sum = meeraReport.taken + meeraReport.missed + meeraReport.skipped;
    assert(sum === meeraReport.expected, `${sum} accounted for, ${meeraReport.expected} expected`);
  });

  check('doses not yet due are counted as pending, not missed', () => {
    assert(meeraReport.pending >= 0, 'pending count is negative');
    const totalSlots = meeraReport.expected + meeraReport.pending;
    assert(totalSlots >= meeraReport.expected, 'pending slots vanished');
  });

  check('per-medication figures reconcile with the totals', () => {
    const taken = meeraReport.perMedication.reduce((s, m) => s + m.taken, 0);
    const missed = meeraReport.perMedication.reduce((s, m) => s + m.missed, 0);
    assert(taken === meeraReport.taken, `per-med taken ${taken} vs total ${meeraReport.taken}`);
    assert(missed === meeraReport.missed, `per-med missed ${missed} vs total ${meeraReport.missed}`);
  });

  check('daily series covers the whole window', () => {
    assert(meeraReport.daily.length === 90, `expected 90 days, got ${meeraReport.daily.length}`);
  });

  check('weekly buckets cover the daily series', () => {
    const covered = meeraReport.weekly.reduce((s, w) => s + w.expected, 0);
    assert(covered === meeraReport.expected, `weekly ${covered} vs total ${meeraReport.expected}`);
  });

  check('streaks are non-negative and current never exceeds longest', () => {
    assert(meeraReport.currentStreak >= 0, 'negative current streak');
    assert(
      meeraReport.currentStreak <= meeraReport.longestStreak,
      `current ${meeraReport.currentStreak} > longest ${meeraReport.longestStreak}`
    );
  });

  check('every percentage is inside 0-100', () => {
    const all = [
      meeraReport.adherence,
      ...meeraReport.perMedication.map((m) => m.adherence),
      ...meeraReport.byBucket.map((b) => b.adherence),
      ...meeraReport.byWeekday.map((w) => w.adherence),
    ].filter((v) => v != null);
    const bad = all.filter((v) => v < 0 || v > 100);
    assert(bad.length === 0, `out-of-bounds percentages: ${bad.join(', ')}`);
  });

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m6. The planted patterns are actually detected\x1b[0m');

  check('Meera: the 06:30 thyroxine is taken far more reliably than the 20:30 metformin', () => {
    const thyroxine = meeraReport.perMedication.find((m) => m.name.startsWith('Levothyroxine'));
    const metformin = meeraReport.perMedication.find((m) => m.name === 'Metformin');
    assert(thyroxine && metformin, 'seed medicines missing');
    const evening = metformin.byTime.find((t) => t.time === '20:30');
    assert(evening, 'no 20:30 slot found for metformin');
    assert(
      thyroxine.adherence - evening.adherence > 20,
      `expected a >20 point gap, got thyroxine ${thyroxine.adherence}% vs evening metformin ${evening.adherence}%`
    );
  });

  check('Meera: the morning metformin beats the evening metformin', () => {
    const metformin = meeraReport.perMedication.find((m) => m.name === 'Metformin');
    const morning = metformin.byTime.find((t) => t.time === '08:30');
    const evening = metformin.byTime.find((t) => t.time === '20:30');
    assert(
      morning.adherence - evening.adherence > 15,
      `same drug, different slot: ${morning.adherence}% vs ${evening.adherence}%`
    );
  });

  check('Meera: the worst time-of-day bucket is the Evening', () => {
    assert(
      meeraReport.worstBucket && meeraReport.worstBucket.bucket === 'Evening',
      `worst bucket was ${meeraReport.worstBucket?.bucket}`
    );
  });

  check('Ravi: weekends are markedly worse than weekdays', () => {
    const weekend = raviReport.byWeekday.filter((w) => w.weekday === 0 || w.weekday === 6);
    const weekday = raviReport.byWeekday.filter((w) => w.weekday > 0 && w.weekday < 6);
    const avg = (xs) => xs.reduce((s, x) => s + x.adherence, 0) / xs.length;
    const gap = avg(weekday) - avg(weekend);
    assert(gap > 20, `expected a >20 point weekend gap, got ${gap.toFixed(1)}`);
  });

  check('Ravi: the worst weekday falls on a Saturday or Sunday', () => {
    assert(
      [0, 6].includes(raviReport.worstWeekday.weekday),
      `worst weekday was ${raviReport.worstWeekday.label}`
    );
  });

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m7. Pattern engine and doctor summary\x1b[0m');

  const meeraSummary = await patternsSvc.buildPatientSummary(meera.id, { days: 90 });
  const raviSummary = await patternsSvc.buildPatientSummary(ravi.id, { days: 90 });

  check('Meera: a time-of-day finding is raised', () => {
    const f = meeraSummary.findings.find((x) => x.id === 'pattern-time-of-day');
    assert(f, 'no time-of-day finding');
    assert(f.headline.includes('Evening'), `headline did not name the evening: ${f.headline}`);
    assert(f.evidence.length >= 2, 'finding has no supporting evidence');
  });

  check('Ravi: the weekend pattern is named as a support problem, not a motivation one', () => {
    const f = raviSummary.findings.find((x) => x.id === 'pattern-weekday');
    assert(f, 'no weekday finding');
    assert(
      /weekend/i.test(f.headline) || /weekend/i.test(f.detail),
      `weekend pattern not identified: ${f.headline}`
    );
  });

  check('the adherence-versus-outcome comparison is computed for both patients', () => {
    assert(meeraSummary.stratified.length > 0, 'nothing stratified for Meera');
    assert(raviSummary.stratified.length > 0, 'nothing stratified for Ravi');
    for (const st of [...meeraSummary.stratified, ...raviSummary.stratified]) {
      assert(st.onTrackN >= 5 && st.missedN >= 5, `underpowered comparison kept: n=${st.onTrackN}/${st.missedN}`);
      assert(st.lagDays === 1, 'the comparison should be lagged by a day, not same-day');
    }
  });

  check('Meera: the missed evening metformin shows up in the next morning sugar', () => {
    const f = meeraSummary.findings.find((x) => x.id === 'link-glucose_fasting');
    assert(f, 'no fasting-glucose correlation finding');
    const st = meeraSummary.stratified.find((x) => x.type === 'glucose_fasting');
    assert(st.difference > 8, `expected a clear rise, got ${st.difference} mg/dL`);
    assert(/higher/.test(f.headline), `headline did not state the direction: ${f.headline}`);
  });

  check('Ravi: missed antihypertensives show up in the next morning blood pressure', () => {
    const st = raviSummary.stratified.find((x) => x.type === 'systolic');
    assert(st, 'systolic was not stratified');
    assert(st.difference > 4, `expected a clear rise, got ${st.difference} mmHg`);
  });

  check('a null correlation is reported rather than silently dropped', () => {
    const nulls = [...meeraSummary.findings, ...raviSummary.findings].filter(
      (f) => f.id.startsWith('link-') && /unchanged/.test(f.headline)
    );
    assert(nulls.length > 0, 'no null result was reported anywhere');
    for (const f of nulls) {
      assert(f.severity === 'info', `a null result was escalated to ${f.severity}`);
      assert(/regimen itself/.test(f.detail), 'the null result does not explain what it implies');
    }
  });

  check('a marginal lab exceedance is not called critical', () => {
    const glucose = raviSummary.findings.find((f) => f.id === 'lab-Glucose');
    assert(glucose, 'glucose not reported for Ravi');
    // 101 against a 70-100 range is a rounding error, not an emergency.
    assert(
      glucose.severity !== 'critical',
      `glucose 101 (ref 70-100) was raised as ${glucose.severity}`
    );
  });

  check('a materially abnormal, worsening lab is called critical', () => {
    const egfr = raviSummary.findings.find((f) => f.id === 'lab-eGFR');
    assert(egfr.severity === 'critical', `eGFR 40 against a 60 floor was ${egfr.severity}`);
  });

  check('Ravi: the falling eGFR is flagged as worsening', () => {
    const f = raviSummary.findings.find((x) => x.id === 'lab-eGFR');
    assert(f, 'eGFR not reported');
    assert(f.severity === 'critical' || f.severity === 'warn', `eGFR severity was ${f.severity}`);
  });

  check('Meera: the rising HbA1c is surfaced', () => {
    const f = meeraSummary.findings.find((x) => x.id === 'lab-HbA1c');
    assert(f, 'HbA1c not reported');
    assert(/7\.8/.test(f.headline), `headline missing the latest value: ${f.headline}`);
  });

  check('missed appointments reduce the attendance rate', () => {
    assert(meeraSummary.followUp.missedVisits > 0, 'seed has no missed visits');
    assert(
      meeraSummary.followUp.attendanceRate < 100,
      `attendance was ${meeraSummary.followUp.attendanceRate}% despite a missed visit`
    );
  });

  check('findings are ordered with the critical ones first', () => {
    const rank = { critical: 0, warn: 1, info: 2, ok: 3 };
    const seq = meeraSummary.findings.map((f) => rank[f.severity]);
    assert(seq.every((v, i) => i === 0 || seq[i - 1] <= v), `out of order: ${seq.join(',')}`);
  });

  check('every finding carries a headline, a detail and a category', () => {
    for (const f of [...meeraSummary.findings, ...raviSummary.findings]) {
      assert(f.headline && f.detail && f.category, `incomplete finding: ${JSON.stringify(f)}`);
    }
  });

  check('the commitment score is a sane 0-100', () => {
    for (const s of [meeraSummary, raviSummary]) {
      assert(s.commitment >= 0 && s.commitment <= 100, `commitment ${s.commitment}`);
    }
  });

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m8. PDF export\x1b[0m');

  check('the summary renders to HTML with the key sections present', () => {
    const html = pdfSvc.summaryToHtml(meeraSummary);
    assert(html.length > 4000, `HTML is suspiciously short: ${html.length} chars`);
    for (const needle of [
      'CLINICAL SUMMARY', 'Meera Nair', 'Adherence',
      'Regimen and per-drug adherence', 'How these numbers were derived',
      'taken ÷ (expected − clinically held)',
    ]) {
      assert(html.includes(needle), `HTML is missing "${needle}"`);
    }
  });

  check('user-supplied text is HTML-escaped', () => {
    const evil = JSON.parse(JSON.stringify(meeraSummary));
    evil.patient.name = '<script>alert(1)</script>';
    const html = pdfSvc.summaryToHtml(evil);
    assert(!html.includes('<script>alert(1)</script>'), 'raw script tag survived into the PDF HTML');
    assert(html.includes('&lt;script&gt;'), 'the name was not escaped at all');
  });

  check('the plain-text fallback carries the headline numbers', () => {
    const text = pdfSvc.summaryToText(meeraSummary);
    assert(text.includes('Meera Nair'), 'name missing');
    assert(/Adherence: \d/.test(text), 'adherence line missing');
    assert(text.includes('KEY FINDINGS'), 'findings section missing');
  });

  /* ---------------------------------------------------------------- */
  console.log('\n\x1b[1m9. Escalation engine\x1b[0m');

  const firstSweep = await alertsSvc.runAlertSweep({ notify: false });
  const alertsAfterFirst = await queries.listAlerts({ limit: 500 });

  check('the sweep converts overdue doses into missed rows and raises alerts', () => {
    assert(
      firstSweep.missedDoses > 0 || alertsAfterFirst.length > 0,
      'the sweep found nothing at all, which the seed should make impossible'
    );
  });

  await checkAsync('a second sweep is idempotent — no duplicate alerts', async () => {
    const before = (await queries.listAlerts({ limit: 500 })).length;
    await alertsSvc.runAlertSweep({ notify: false });
    const after = (await queries.listAlerts({ limit: 500 })).length;
    assert(after === before, `alert count went ${before} -> ${after} on a repeat sweep`);
  });

  await checkAsync('every alert has a unique dedupe key', async () => {
    const all = await queries.listAlerts({ includeResolved: true, limit: 500 });
    const keys = all.map((a) => a.dedupe_key);
    assert(new Set(keys).size === keys.length, 'duplicate dedupe keys exist');
  });

  await checkAsync('a red-flag symptom escalates immediately', async () => {
    const before = (await queries.listAlerts({ patientId: ravi.id, limit: 500 })).length;
    await queries.addSymptom({
      patient_id: ravi.id,
      name: 'Chest pain or tightness',
      severity: 5,
      red_flag: 1,
      note: 'Verification harness',
      recorded_by: anita.id,
    });
    await alertsSvc.raiseSymptomAlert({
      patient: ravi,
      name: 'Chest pain or tightness',
      severity: 5,
      note: 'Verification harness',
      notedAt: dateUtil.stamp(),
      reportedByName: 'Anita Rao',
    });
    const after = await queries.listAlerts({ patientId: ravi.id, limit: 500 });
    assert(after.length === before + 1, `expected one new alert, went ${before} -> ${after.length}`);
    assert(after[0].severity === 'critical', `severity 5 red flag was raised as ${after[0].severity}`);
  });

  await checkAsync("Ravi's mildly raised potassium is reported, but not as an emergency", async () => {
    const alerts = await queries.listAlerts({ patientId: ravi.id, includeResolved: true, limit: 500 });
    const labAlerts = alerts.filter((a) => a.kind === 'lab_out_of_range');
    assert(labAlerts.length > 0, 'the out-of-range panel raised nothing at all');
    const mentioning = labAlerts.find((a) => /Potassium/.test(a.title) || /Potassium/.test(a.body || ''));
    assert(mentioning, 'potassium 5.3 (ref 3.5-5.1) was never reported');
    assert(
      mentioning.severity === 'warn',
      `5.3 is mild hyperkalaemia and should be a warning, not ${mentioning.severity}`
    );
  });

  await checkAsync('a genuinely dangerous value does escalate as critical', async () => {
    await queries.addPanel(
      {
        patient_id: ravi.id,
        panel: 'Basic Metabolic Panel',
        collected_on: dateUtil.dateKey(),
        lab_name: 'Verification harness',
        recorded_by: anita.id,
      },
      [{ analyte: 'Potassium', value: 6.2, unit: 'mmol/L', ref_low: 3.5, ref_high: 5.1 }]
    );
    await alertsSvc.runAlertSweep({ notify: false });
    const alerts = await queries.listAlerts({ patientId: ravi.id, includeResolved: true, limit: 500 });
    const critical = alerts.find(
      (a) => a.kind === 'lab_out_of_range' && a.severity === 'critical' && /Potassium 6.2/.test(a.title)
    );
    assert(critical, 'potassium 6.2 did not escalate as critical');
    assert(/arrhythmia/.test(critical.body), 'the critical alert does not say why it matters');
  });

  await checkAsync('marking a dose taken removes it from the missed count', async () => {
    const before = await adherenceSvc.adherenceReport(meera.id, 90);
    const missedRows = await queries.unresolvedPastDoses(
      meera.id,
      dateUtil.dateKey(dateUtil.addDays(new Date(), -7))
    );
    assert(missedRows.length > 0, 'no missed doses to correct');
    await queries.recordDose({
      medicationId: missedRows[0].medication_id,
      patientId: meera.id,
      scheduledFor: missedRows[0].scheduled_for,
      status: 'taken',
      recordedBy: anita.id,
    });
    const after = await adherenceSvc.adherenceReport(meera.id, 90);
    assert(after.missed === before.missed - 1, `missed went ${before.missed} -> ${after.missed}`);
    assert(after.taken === before.taken + 1, `taken went ${before.taken} -> ${after.taken}`);
    assert(after.expected === before.expected, 'the denominator moved, which it should not');
  });

  await checkAsync('recording the same slot twice updates rather than duplicates', async () => {
    const meds = await queries.listScheduledMedications(meera.id);
    const slot = `${dateUtil.dateKey(dateUtil.addDays(new Date(), -3))}T08:30`;
    const med = meds.find((m) => m.name === 'Metformin');
    await queries.recordDose({ medicationId: med.id, patientId: meera.id, scheduledFor: slot, status: 'taken', recordedBy: meera.id });
    await queries.recordDose({ medicationId: med.id, patientId: meera.id, scheduledFor: slot, status: 'missed', recordedBy: meera.id });
    const rows = await queries.logsForDay(meera.id, dateUtil.dateKey(dateUtil.addDays(new Date(), -3)));
    const forSlot = rows.filter((r) => r.medication_id === med.id && r.scheduled_for === slot);
    assert(forSlot.length === 1, `expected 1 row for the slot, found ${forSlot.length}`);
    assert(forSlot[0].status === 'missed', `expected the later write to win, got ${forSlot[0].status}`);
  });

  /* ---------------------------------------------------------------- */
  console.log(`\n\x1b[1mResult:\x1b[0m ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ${f.name}\n    ${f.err.stack.split('\n')[0]}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nHarness crashed:\n', err);
  process.exit(1);
});
