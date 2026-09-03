/**
 * The only module that writes SQL. Screens call these functions.
 */

import { all, one, run } from './database';
import { dateKey, stamp, addDays } from '../utils/date';

/* ---------------- users ---------------- */

export const listUsers = () =>
  all(`SELECT * FROM users ORDER BY role DESC, id ASC`);

export const listPatients = () =>
  all(`SELECT * FROM users WHERE role = 'patient' ORDER BY id ASC`);

export const getUser = (id) => one(`SELECT * FROM users WHERE id = ?`, [id]);

export const verifyPin = (userId, pin) =>
  one(`SELECT * FROM users WHERE id = ? AND pin = ?`, [userId, pin]);

export const updateUser = (id, patch) => {
  const fields = Object.keys(patch);
  if (!fields.length) return Promise.resolve();
  return run(
    `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((f) => patch[f]), id]
  );
};

/* ---------------- conditions ---------------- */

export const listConditions = (patientId) =>
  all(
    `SELECT * FROM conditions WHERE patient_id = ?
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, name`,
    [patientId]
  );

export const getCondition = (id) => one(`SELECT * FROM conditions WHERE id = ?`, [id]);

export const addCondition = (c) =>
  run(
    `INSERT INTO conditions (patient_id, name, icd_hint, diagnosed_on, severity, status,
                             treatment_goal, target_metric, target_low, target_high, notes,
                             recorded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      c.patient_id, c.name, c.icd_hint || null, c.diagnosed_on || dateKey(), c.severity || 'moderate',
      c.status || 'active', c.treatment_goal || null, c.target_metric || null,
      c.target_low ?? null, c.target_high ?? null, c.notes || null, c.recorded_by, stamp(),
    ]
  );

export const updateCondition = (id, patch) => {
  const fields = Object.keys(patch);
  if (!fields.length) return Promise.resolve();
  return run(
    `UPDATE conditions SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((f) => patch[f]), id]
  );
};

export const deleteCondition = (id) => run(`DELETE FROM conditions WHERE id = ?`, [id]);

/* ---------------- medications ---------------- */

export const listMedications = (patientId, { includeInactive = false } = {}) =>
  all(
    `SELECT m.*, c.name AS condition_name
     FROM medications m
     LEFT JOIN conditions c ON c.id = m.condition_id
     WHERE m.patient_id = ? ${includeInactive ? '' : 'AND m.active = 1'}
     ORDER BY m.is_emergency ASC, m.name ASC`,
    [patientId]
  );

export const listScheduledMedications = (patientId) =>
  all(
    `SELECT m.*, c.name AS condition_name
     FROM medications m
     LEFT JOIN conditions c ON c.id = m.condition_id
     WHERE m.patient_id = ? AND m.active = 1 AND m.is_emergency = 0
     ORDER BY m.name`,
    [patientId]
  );

export const listEmergencyMedications = (patientId) =>
  all(
    `SELECT * FROM medications WHERE patient_id = ? AND is_emergency = 1 AND active = 1 ORDER BY name`,
    [patientId]
  );

export const getMedication = (id) => one(`SELECT * FROM medications WHERE id = ?`, [id]);

export const addMedication = (m) =>
  run(
    `INSERT INTO medications (patient_id, condition_id, name, dose, form, instructions, times,
                              days_of_week, start_date, end_date, is_emergency, critical, active,
                              recorded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    [
      m.patient_id, m.condition_id || null, m.name, m.dose, m.form || 'tablet',
      m.instructions || null, JSON.stringify(m.times || []),
      JSON.stringify(m.days_of_week || [0, 1, 2, 3, 4, 5, 6]),
      m.start_date || dateKey(), m.end_date || null,
      m.is_emergency ? 1 : 0, m.critical ? 1 : 0, m.recorded_by, stamp(),
    ]
  );

export const updateMedication = (id, patch) => {
  const body = { ...patch };
  if (Array.isArray(body.times)) body.times = JSON.stringify(body.times);
  if (Array.isArray(body.days_of_week)) body.days_of_week = JSON.stringify(body.days_of_week);
  const fields = Object.keys(body);
  if (!fields.length) return Promise.resolve();
  return run(
    `UPDATE medications SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((f) => body[f]), id]
  );
};

export const archiveMedication = (id) => run(`UPDATE medications SET active = 0 WHERE id = ?`, [id]);

/* ---------------- dose logs ---------------- */

export const logsForDay = (patientId, day) =>
  all(
    `SELECT * FROM dose_logs WHERE patient_id = ? AND scheduled_for LIKE ?`,
    [patientId, `${day}T%`]
  );

export const logsBetween = (patientId, fromDay, toDay) =>
  all(
    `SELECT d.*, m.name AS med_name, m.dose, m.critical, m.condition_id
     FROM dose_logs d JOIN medications m ON m.id = d.medication_id
     WHERE d.patient_id = ? AND d.scheduled_for >= ? AND d.scheduled_for <= ?
     ORDER BY d.scheduled_for ASC`,
    [patientId, `${fromDay}T00:00`, `${toDay}T23:59`]
  );

export const recordDose = ({ medicationId, patientId, scheduledFor, status, reason, recordedBy }) =>
  run(
    `INSERT INTO dose_logs (medication_id, patient_id, scheduled_for, status, acted_at, reason, recorded_by)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(medication_id, scheduled_for)
     DO UPDATE SET status = excluded.status,
                   acted_at = excluded.acted_at,
                   reason = excluded.reason,
                   recorded_by = excluded.recorded_by`,
    [medicationId, patientId, scheduledFor, status, status === 'missed' ? null : stamp(), reason || null, recordedBy]
  );

export const unresolvedPastDoses = (patientId, sinceDay) =>
  all(
    `SELECT d.*, m.name AS med_name, m.dose FROM dose_logs d
     JOIN medications m ON m.id = d.medication_id
     WHERE d.patient_id = ? AND d.status = 'missed' AND d.scheduled_for >= ?
     ORDER BY d.scheduled_for DESC`,
    [patientId, `${sinceDay}T00:00`]
  );

/* ---------------- vitals ---------------- */

export const listVitals = (patientId, type, limit = 120) =>
  all(
    `SELECT * FROM vitals WHERE patient_id = ? AND type = ?
     ORDER BY recorded_at DESC LIMIT ?`,
    [patientId, type, limit]
  );

export const latestVital = (patientId, type) =>
  one(
    `SELECT * FROM vitals WHERE patient_id = ? AND type = ? ORDER BY recorded_at DESC LIMIT 1`,
    [patientId, type]
  );

export const vitalsSince = (patientId, sinceDay) =>
  all(
    `SELECT * FROM vitals WHERE patient_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`,
    [patientId, `${sinceDay}T00:00`]
  );

export const addVital = (v) =>
  run(
    `INSERT INTO vitals (patient_id, type, value, unit, recorded_at, recorded_by, note)
     VALUES (?,?,?,?,?,?,?)`,
    [v.patient_id, v.type, v.value, v.unit || null, v.recorded_at || stamp(), v.recorded_by, v.note || null]
  );

export const deleteVital = (id) => run(`DELETE FROM vitals WHERE id = ?`, [id]);

/* ---------------- labs ---------------- */

export const listPanels = (patientId) =>
  all(
    `SELECT p.*, u.name AS recorded_by_name,
            (SELECT COUNT(*) FROM lab_results r WHERE r.panel_id = p.id) AS result_count
     FROM lab_panels p LEFT JOIN users u ON u.id = p.recorded_by
     WHERE p.patient_id = ? ORDER BY p.collected_on DESC`,
    [patientId]
  );

export const panelResults = (panelId) =>
  all(`SELECT * FROM lab_results WHERE panel_id = ? ORDER BY id ASC`, [panelId]);

export const analyteHistory = (patientId, analyte) =>
  all(
    `SELECT r.value, r.unit, r.ref_low, r.ref_high, p.collected_on
     FROM lab_results r JOIN lab_panels p ON p.id = r.panel_id
     WHERE p.patient_id = ? AND r.analyte = ?
     ORDER BY p.collected_on ASC`,
    [patientId, analyte]
  );

export const addPanel = async (panel, rows) => {
  const res = await run(
    `INSERT INTO lab_panels (patient_id, panel, collected_on, lab_name, recorded_by, note)
     VALUES (?,?,?,?,?,?)`,
    [panel.patient_id, panel.panel, panel.collected_on, panel.lab_name || null, panel.recorded_by, panel.note || null]
  );
  const panelId = res.lastInsertRowId;
  for (const r of rows) {
    if (r.value === '' || r.value == null || Number.isNaN(Number(r.value))) continue;
    await run(
      `INSERT INTO lab_results (panel_id, analyte, value, unit, ref_low, ref_high) VALUES (?,?,?,?,?,?)`,
      [panelId, r.analyte, Number(r.value), r.unit || null, r.ref_low ?? null, r.ref_high ?? null]
    );
  }
  return panelId;
};

export const deletePanel = (id) => run(`DELETE FROM lab_panels WHERE id = ?`, [id]);

/* ---------------- appointments ---------------- */

export const listAppointments = (patientId) =>
  all(
    `SELECT a.*, c.name AS condition_name FROM appointments a
     LEFT JOIN conditions c ON c.id = a.condition_id
     WHERE a.patient_id = ? ORDER BY a.scheduled_for DESC`,
    [patientId]
  );

export const upcomingAppointments = (patientId) =>
  all(
    `SELECT * FROM appointments
     WHERE patient_id = ? AND status = 'scheduled' AND scheduled_for >= ?
     ORDER BY scheduled_for ASC`,
    [patientId, dateKey()]
  );

export const addAppointment = (a) =>
  run(
    `INSERT INTO appointments (patient_id, condition_id, doctor_name, specialty, scheduled_for,
                               purpose, status, outcome, next_followup, recorded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      a.patient_id, a.condition_id || null, a.doctor_name, a.specialty || null, a.scheduled_for,
      a.purpose || null, a.status || 'scheduled', a.outcome || null, a.next_followup || null, a.recorded_by,
    ]
  );

export const updateAppointment = (id, patch) => {
  const fields = Object.keys(patch);
  if (!fields.length) return Promise.resolve();
  return run(
    `UPDATE appointments SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((f) => patch[f]), id]
  );
};

export const deleteAppointment = (id) => run(`DELETE FROM appointments WHERE id = ?`, [id]);

/* ---------------- symptoms ---------------- */

export const listSymptoms = (patientId, limit = 100) =>
  all(
    `SELECT s.*, u.name AS recorded_by_name FROM symptoms s
     LEFT JOIN users u ON u.id = s.recorded_by
     WHERE s.patient_id = ? ORDER BY s.noted_at DESC LIMIT ?`,
    [patientId, limit]
  );

export const addSymptom = (s) =>
  run(
    `INSERT INTO symptoms (patient_id, name, severity, red_flag, noted_at, note, recorded_by)
     VALUES (?,?,?,?,?,?,?)`,
    [s.patient_id, s.name, s.severity, s.red_flag ? 1 : 0, s.noted_at || stamp(), s.note || null, s.recorded_by]
  );

export const deleteSymptom = (id) => run(`DELETE FROM symptoms WHERE id = ?`, [id]);

/* ---------------- alerts ---------------- */

export const listAlerts = ({ patientId = null, includeResolved = false, limit = 200 } = {}) =>
  all(
    `SELECT a.*, u.name AS patient_name, u.color AS patient_color FROM alerts a
     JOIN users u ON u.id = a.patient_id
     WHERE (? IS NULL OR a.patient_id = ?)
       ${includeResolved ? '' : 'AND a.resolved_at IS NULL'}
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
              a.created_at DESC
     LIMIT ?`,
    [patientId, patientId, limit]
  );

export const unreadAlertCount = async (patientId = null) => {
  const row = await one(
    `SELECT COUNT(*) AS n FROM alerts
     WHERE read_at IS NULL AND resolved_at IS NULL AND (? IS NULL OR patient_id = ?)`,
    [patientId, patientId]
  );
  return row ? row.n : 0;
};

export const createAlert = (a) =>
  run(
    `INSERT OR IGNORE INTO alerts (patient_id, kind, severity, title, body, dedupe_key, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [a.patient_id, a.kind, a.severity, a.title, a.body || null, a.dedupe_key, a.created_at || stamp()]
  );

export const markAlertRead = (id) => run(`UPDATE alerts SET read_at = ? WHERE id = ?`, [stamp(), id]);

export const markAllAlertsRead = (patientId = null) =>
  run(
    `UPDATE alerts SET read_at = ? WHERE read_at IS NULL AND (? IS NULL OR patient_id = ?)`,
    [stamp(), patientId, patientId]
  );

export const resolveAlert = (id) =>
  run(`UPDATE alerts SET resolved_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ?`, [stamp(), stamp(), id]);

export const purgeOldAlerts = () =>
  run(`DELETE FROM alerts WHERE resolved_at IS NOT NULL AND resolved_at < ?`, [
    `${dateKey(addDays(new Date(), -60))}T00:00`,
  ]);
