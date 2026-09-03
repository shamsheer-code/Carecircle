/**
 * Doctor summary export.
 *
 * Written for a clinician reading it cold in a ten-minute consultation:
 * the answer first, the working underneath, and an explicit statement of how
 * adherence was defined so the percentage can be trusted.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fmtDate, fmtShortDate, dayOf, age } from '../utils/date';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const SEV_COLOR = { critical: '#C4372F', warn: '#B4700B', info: '#1D4ED8', ok: '#15803D' };
const SEV_LABEL = { critical: 'Needs action', warn: 'Watch', info: 'Note', ok: 'Stable' };

export function summaryToHtml(summary) {
  const {
    patient, conditions, medications, adherence, trend, followUp,
    vitalSummaries, labs, findings, commitment, windowDays, generatedOn, headline, symptoms,
  } = summary;

  const criticals = findings.filter((f) => f.severity === 'critical');
  const rest = findings.filter((f) => f.severity !== 'critical');

  const findingCard = (f) => `
    <div class="finding" style="border-left-color:${SEV_COLOR[f.severity]}">
      <div class="f-top">
        <span class="chip" style="background:${SEV_COLOR[f.severity]}1A;color:${SEV_COLOR[f.severity]}">
          ${esc(SEV_LABEL[f.severity])}
        </span>
        <span class="cat">${esc(f.category)}</span>
      </div>
      <h4>${esc(f.headline)}</h4>
      <p>${esc(f.detail)}</p>
      ${
        f.evidence?.length
          ? `<ul class="ev">${f.evidence.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`
          : ''
      }
    </div>`;

  const medRows = adherence.perMedication
    .map((m) => {
      const colour = m.adherence == null ? '#5F7480' : m.adherence >= 90 ? '#15803D' : m.adherence >= 75 ? '#B4700B' : '#C4372F';
      const times = m.byTime.map((t) => `${t.time} ${t.adherence}%`).join(' · ');
      return `<tr>
        <td><strong>${esc(m.name)}</strong> ${esc(m.dose)}${m.critical ? ' <span class="crit">critical</span>' : ''}
          ${times ? `<div class="sub">${esc(times)}</div>` : ''}</td>
        <td class="num" style="color:${colour}"><strong>${m.adherence ?? '—'}%</strong></td>
        <td class="num">${m.taken}</td>
        <td class="num">${m.missed}</td>
        <td class="num">${m.skipped}</td>
      </tr>`;
    })
    .join('');

  const vitalRows = vitalSummaries
    .map(
      (v) => `<tr>
        <td>${esc(v.label)}</td>
        <td class="num">${v.mean} ${esc(v.unit)}</td>
        <td class="num">${v.min}–${v.max}</td>
        <td class="num">${v.count}</td>
        <td class="num" style="color:${v.outOfRangePct >= 30 ? '#B4700B' : '#15803D'}">${v.outOfRangePct}%</td>
      </tr>`
    )
    .join('');

  const labRows = labs.trends
    .map((t) => {
      const colour = t.flag === 'normal' ? '#15803D' : '#B4700B';
      const arrow = t.direction === 'up' ? '↑' : t.direction === 'down' ? '↓' : '→';
      return `<tr>
        <td>${esc(t.analyte)}<div class="sub">${esc(t.panel)}</div></td>
        <td class="num" style="color:${colour}"><strong>${t.latest} ${esc(t.unit || '')}</strong></td>
        <td class="num">${t.refLow ?? '—'}–${t.refHigh ?? '—'}</td>
        <td class="num">${arrow} ${t.change != null ? (t.change > 0 ? '+' : '') + t.change : '—'}</td>
        <td class="num">${esc(fmtShortDate(t.latestOn))}</td>
      </tr>`;
    })
    .join('');

  const conditionBlocks = conditions
    .map((c) => {
      const meds = medications.filter((m) => m.condition_id === c.id);
      return `<div class="cond">
        <h4>${esc(c.name)} <span class="sub">${esc(c.severity || '')} · diagnosed ${esc(fmtDate(c.diagnosed_on))}</span></h4>
        ${c.treatment_goal ? `<p class="goal"><strong>Goal:</strong> ${esc(c.treatment_goal)}</p>` : ''}
        ${
          meds.length
            ? `<p class="sub">On: ${meds.map((m) => `${esc(m.name)} ${esc(m.dose)}`).join(', ')}</p>`
            : '<p class="sub">No medication linked.</p>'
        }
      </div>`;
    })
    .join('');

  const recentSymptoms = symptoms
    .slice(0, 10)
    .map(
      (s) => `<tr>
        <td>${esc(fmtShortDate(dayOf(s.noted_at)))}</td>
        <td>${esc(s.name)}${s.red_flag ? ' <span class="crit">red flag</span>' : ''}</td>
        <td class="num">${s.severity}/5</td>
        <td>${esc(s.note || '')}</td>
      </tr>`
    )
    .join('');

  const weekBars = adherence.weekly
    .map((w) => {
      const h = w.adherence == null ? 0 : w.adherence;
      const colour = h >= 90 ? '#15803D' : h >= 75 ? '#B4700B' : '#C4372F';
      return `<div class="bar-wrap">
        <div class="bar-track"><div class="bar" style="height:${h}%;background:${colour}"></div></div>
        <div class="bar-lbl">${esc(fmtShortDate(w.from))}</div>
        <div class="bar-val">${w.adherence ?? '—'}%</div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
         color: #0E1A1F; font-size: 11px; line-height: 1.5; margin: 0; }
  h1 { font-size: 21px; margin: 0 0 2px; letter-spacing: -0.3px; }
  h2 { font-size: 13px; margin: 22px 0 8px; text-transform: uppercase;
       letter-spacing: 1px; color: #0F766E; border-bottom: 1.5px solid #DCF1EE; padding-bottom: 4px; }
  h4 { font-size: 12.5px; margin: 0 0 4px; }
  p { margin: 0 0 6px; }
  .sub { color: #5F7480; font-size: 10px; font-weight: 400; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start;
         border-bottom: 2.5px solid #0F766E; padding-bottom: 10px; }
  .hdr .meta { text-align: right; color: #5F7480; font-size: 10px; }
  .brand { color: #0F766E; font-weight: 700; letter-spacing: 1.5px; font-size: 10px; }
  .headline { background: #DCF1EE; border-radius: 8px; padding: 11px 13px; margin: 14px 0;
              font-size: 12.5px; font-weight: 600; }
  .kpis { display: flex; gap: 8px; margin: 12px 0 4px; }
  .kpi { flex: 1; border: 1px solid #E3E9EC; border-radius: 8px; padding: 9px 10px; }
  .kpi .v { font-size: 19px; font-weight: 700; line-height: 1.1; }
  .kpi .l { font-size: 9px; color: #5F7480; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 3px; }
  .finding { border-left: 3px solid #ccc; background: #F8FAFB; border-radius: 0 8px 8px 0;
             padding: 9px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .f-top { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
  .chip { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px;
          padding: 2px 6px; border-radius: 4px; }
  .cat { font-size: 9px; color: #5F7480; text-transform: uppercase; letter-spacing: 0.7px; }
  .ev { margin: 5px 0 0; padding-left: 15px; color: #5F7480; font-size: 10px; }
  .ev li { margin-bottom: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: avoid; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px;
       color: #5F7480; border-bottom: 1px solid #E3E9EC; padding: 5px 6px; font-weight: 600; }
  td { padding: 6px; border-bottom: 1px solid #F0F4F5; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .crit { background: #FBE7E5; color: #C4372F; font-size: 8.5px; font-weight: 700;
          padding: 1px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
  .cond { border: 1px solid #E3E9EC; border-radius: 8px; padding: 9px 11px; margin-bottom: 7px;
          page-break-inside: avoid; }
  .goal { font-size: 10.5px; }
  .chart { display: flex; gap: 5px; align-items: flex-end; height: 110px; margin: 10px 0 4px; }
  .bar-wrap { flex: 1; text-align: center; }
  .bar-track { height: 80px; background: #F0F4F5; border-radius: 3px; display: flex;
               align-items: flex-end; overflow: hidden; }
  .bar { width: 100%; border-radius: 3px 3px 0 0; }
  .bar-lbl { font-size: 8px; color: #93A5AE; margin-top: 3px; }
  .bar-val { font-size: 9px; font-weight: 700; }
  .method { background: #F8FAFB; border: 1px dashed #D5DEE2; border-radius: 8px;
            padding: 9px 11px; font-size: 9.5px; color: #5F7480; margin-top: 6px; }
  .foot { margin-top: 20px; padding-top: 8px; border-top: 1px solid #E3E9EC;
          font-size: 9px; color: #93A5AE; }
</style></head>
<body>

  <div class="hdr">
    <div>
      <div class="brand">CARECIRCLE · CLINICAL SUMMARY</div>
      <h1>${esc(patient.name)}</h1>
      <div class="sub">
        ${age(patient.dob) ? `${age(patient.dob)} yrs · ` : ''}${esc(patient.sex || '')}
        ${patient.blood_group ? ` · ${esc(patient.blood_group)}` : ''}
        ${patient.allergies ? ` · Allergies: ${esc(patient.allergies)}` : ''}
      </div>
    </div>
    <div class="meta">
      Generated ${esc(fmtDate(generatedOn))}<br/>
      Observation window ${windowDays} days<br/>
      ${esc(fmtShortDate(adherence.from))} – ${esc(fmtShortDate(adherence.to))}
    </div>
  </div>

  <div class="headline">${esc(headline)}</div>

  <div class="kpis">
    <div class="kpi"><div class="v">${adherence.adherence ?? '—'}%</div><div class="l">Adherence</div></div>
    <div class="kpi"><div class="v">${trend.delta == null ? '—' : (trend.delta > 0 ? '+' : '') + trend.delta}</div><div class="l">vs prior period</div></div>
    <div class="kpi"><div class="v">${adherence.missed}</div><div class="l">Doses missed</div></div>
    <div class="kpi"><div class="v">${followUp.totalVisits}</div><div class="l">Visits attended</div></div>
    <div class="kpi"><div class="v">${commitment ?? '—'}</div><div class="l">Commitment score</div></div>
  </div>

  ${criticals.length ? `<h2>Needs your attention</h2>${criticals.map(findingCard).join('')}` : ''}

  <h2>Weekly adherence trend</h2>
  <div class="chart">${weekBars}</div>

  <h2>Regimen and per-drug adherence</h2>
  <table>
    <thead><tr><th>Medication</th><th class="num">Adherence</th><th class="num">Taken</th>
    <th class="num">Missed</th><th class="num">Held</th></tr></thead>
    <tbody>${medRows}</tbody>
  </table>

  <h2>Conditions and treatment goals</h2>
  ${conditionBlocks}

  ${vitalRows ? `<h2>Home vitals (${windowDays} days)</h2>
  <table>
    <thead><tr><th>Measure</th><th class="num">Mean</th><th class="num">Range</th>
    <th class="num">Readings</th><th class="num">Out of range</th></tr></thead>
    <tbody>${vitalRows}</tbody>
  </table>` : ''}

  ${labRows ? `<h2>Laboratory trends</h2>
  <table>
    <thead><tr><th>Analyte</th><th class="num">Latest</th><th class="num">Reference</th>
    <th class="num">Change</th><th class="num">Collected</th></tr></thead>
    <tbody>${labRows}</tbody>
  </table>` : ''}

  ${recentSymptoms ? `<h2>Recent symptoms</h2>
  <table>
    <thead><tr><th>Date</th><th>Symptom</th><th class="num">Severity</th><th>Note</th></tr></thead>
    <tbody>${recentSymptoms}</tbody>
  </table>` : ''}

  ${rest.length ? `<h2>Other observations</h2>${rest.map(findingCard).join('')}` : ''}

  <h2>How these numbers were derived</h2>
  <div class="method">
    <strong>Adherence % = taken ÷ (expected − clinically held) × 100.</strong>
    Expected doses are generated from the prescribed schedule stored in the app. A dose counts as
    missed only after its grace window closes — 45 minutes for medications flagged critical, 90 minutes
    otherwise. Doses a clinician instructed the patient to hold are recorded separately and excluded
    from the denominator. Doses not yet due are excluded entirely.
    <br/><br/>
    Home vitals and laboratory values are entered manually by the patient or caretaker and are
    <strong>not</strong> verified against a device or laboratory feed. The adherence-stratified
    comparison splits readings by whether every scheduled dose that day was taken; it is observational
    and not adjusted for confounding.
    <br/><br/>
    Commitment score is a weighted blend of dose adherence (60%), appointment attendance (25%) and
    self-monitoring consistency (15%).
  </div>

  <div class="foot">
    Generated by CareCircle on ${esc(fmtDate(generatedOn))} from patient- and caretaker-entered records.
    This document supports a clinical conversation; it is not a diagnostic instrument and does not
    replace clinical judgement or formal laboratory reporting.
  </div>

</body></html>`;
}

/**
 * Render and hand to the OS share sheet.
 * @returns {Promise<{uri: string, shared: boolean}>}
 */
export async function exportSummaryPdf(summary) {
  const html = summaryToHtml(summary);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${summary.patient.name} — clinical summary`,
      UTI: 'com.adobe.pdf',
    });
    return { uri, shared: true };
  }
  return { uri, shared: false };
}

/** Plain-text fallback, for pasting into a message to the doctor. */
export function summaryToText(summary) {
  const { patient, adherence, followUp, findings, generatedOn, windowDays } = summary;
  const lines = [
    `CARECIRCLE SUMMARY — ${patient.name}`,
    `${fmtDate(generatedOn)} · last ${windowDays} days`,
    '',
    `Adherence: ${adherence.adherence ?? '—'}% (${adherence.taken} taken, ${adherence.missed} missed)`,
    `Visits: ${followUp.totalVisits} attended, ${followUp.missedVisits} missed`,
    '',
    'KEY FINDINGS',
  ];
  for (const f of findings.slice(0, 6)) {
    lines.push(`• [${SEV_LABEL[f.severity]}] ${f.headline}`);
    lines.push(`  ${f.detail}`);
  }
  lines.push('', 'Adherence % = taken ÷ (expected − clinically held) × 100.');
  return lines.join('\n');
}
