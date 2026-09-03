/**
 * CareCircle local schema.
 *
 * Everything lives on the device. There is no server, so every table that a
 * human can write to carries `recorded_by` — that is how we distinguish
 * "the patient logged this" from "the caretaker logged this on their behalf",
 * which the doctor summary reports on.
 */

export const SCHEMA_VERSION = 1;

export const CREATE_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('patient','caretaker')),
  pin               TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '#0F766E',
  dob               TEXT,
  sex               TEXT,
  blood_group       TEXT,
  height_cm         REAL,
  emergency_contact TEXT,
  allergies         TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conditions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  icd_hint       TEXT,
  diagnosed_on   TEXT,
  severity       TEXT CHECK (severity IN ('mild','moderate','severe')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','remission','resolved')),
  treatment_goal TEXT,
  target_metric  TEXT,          -- e.g. 'tsh' / 'systolic' / 'hba1c'
  target_low     REAL,
  target_high    REAL,
  notes          TEXT,
  recorded_by    INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  condition_id  INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  dose          TEXT NOT NULL,
  form          TEXT DEFAULT 'tablet',
  instructions  TEXT,
  times         TEXT NOT NULL,   -- JSON array of "HH:MM", empty [] for PRN
  days_of_week  TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  is_emergency  INTEGER NOT NULL DEFAULT 0,   -- PRN / rescue medication
  critical      INTEGER NOT NULL DEFAULT 0,   -- missing this escalates immediately
  active        INTEGER NOT NULL DEFAULT 1,
  recorded_by   INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dose_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  medication_id  INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  patient_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_for  TEXT NOT NULL,   -- ISO local 'YYYY-MM-DDTHH:MM'
  status         TEXT NOT NULL CHECK (status IN ('taken','missed','skipped')),
  acted_at       TEXT,
  reason         TEXT,
  recorded_by    INTEGER REFERENCES users(id),
  UNIQUE (medication_id, scheduled_for)
);

CREATE TABLE IF NOT EXISTS vitals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,     -- systolic | diastolic | pulse | glucose_fasting | weight | spo2 | temperature
  value       REAL NOT NULL,
  unit        TEXT,
  recorded_at TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id),
  note        TEXT
);

CREATE TABLE IF NOT EXISTS lab_panels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  panel        TEXT NOT NULL,    -- 'Basic Metabolic Panel', 'Thyroid Panel', ...
  collected_on TEXT NOT NULL,
  lab_name     TEXT,
  recorded_by  INTEGER REFERENCES users(id),
  note         TEXT
);

CREATE TABLE IF NOT EXISTS lab_results (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_id  INTEGER NOT NULL REFERENCES lab_panels(id) ON DELETE CASCADE,
  analyte   TEXT NOT NULL,
  value     REAL NOT NULL,
  unit      TEXT,
  ref_low   REAL,
  ref_high  REAL
);

CREATE TABLE IF NOT EXISTS appointments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  condition_id  INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
  doctor_name   TEXT NOT NULL,
  specialty     TEXT,
  scheduled_for TEXT NOT NULL,
  purpose       TEXT,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','completed','missed','cancelled')),
  outcome       TEXT,
  next_followup TEXT,
  recorded_by   INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS symptoms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  severity    INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  red_flag    INTEGER NOT NULL DEFAULT 0,
  noted_at    TEXT NOT NULL,
  note        TEXT,
  recorded_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,    -- missed_dose | streak | red_flag | followup_due | lab_out_of_range | adherence_drop
  severity    TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  title       TEXT NOT NULL,
  body        TEXT,
  dedupe_key  TEXT UNIQUE,
  created_at  TEXT NOT NULL,
  read_at     TEXT,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dose_patient  ON dose_logs (patient_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_dose_med      ON dose_logs (medication_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_vitals_pt     ON vitals (patient_id, type, recorded_at);
CREATE INDEX IF NOT EXISTS idx_symptoms_pt   ON symptoms (patient_id, noted_at);
CREATE INDEX IF NOT EXISTS idx_alerts_pt     ON alerts (patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_appt_pt       ON appointments (patient_id, scheduled_for);
`;

/** Vital display metadata, used by charts and the doctor summary. */
export const VITAL_TYPES = {
  systolic: { label: 'Systolic BP', unit: 'mmHg', low: 90, high: 130, decimals: 0 },
  diastolic: { label: 'Diastolic BP', unit: 'mmHg', low: 60, high: 85, decimals: 0 },
  pulse: { label: 'Pulse', unit: 'bpm', low: 55, high: 100, decimals: 0 },
  glucose_fasting: { label: 'Fasting glucose', unit: 'mg/dL', low: 70, high: 130, decimals: 0 },
  weight: { label: 'Weight', unit: 'kg', low: null, high: null, decimals: 1 },
  spo2: { label: 'SpO₂', unit: '%', low: 94, high: 100, decimals: 0 },
  temperature: { label: 'Temperature', unit: '°C', low: 36.1, high: 37.5, decimals: 1 },
};

/** Reference ranges used when a panel is entered by hand. */
export const PANEL_TEMPLATES = {
  'Basic Metabolic Panel': [
    { analyte: 'Sodium', unit: 'mmol/L', ref_low: 135, ref_high: 145 },
    { analyte: 'Potassium', unit: 'mmol/L', ref_low: 3.5, ref_high: 5.1 },
    { analyte: 'Chloride', unit: 'mmol/L', ref_low: 98, ref_high: 107 },
    { analyte: 'Bicarbonate', unit: 'mmol/L', ref_low: 22, ref_high: 29 },
    { analyte: 'BUN', unit: 'mg/dL', ref_low: 7, ref_high: 20 },
    { analyte: 'Creatinine', unit: 'mg/dL', ref_low: 0.6, ref_high: 1.3 },
    { analyte: 'Glucose', unit: 'mg/dL', ref_low: 70, ref_high: 100 },
    { analyte: 'Calcium', unit: 'mg/dL', ref_low: 8.6, ref_high: 10.3 },
    { analyte: 'eGFR', unit: 'mL/min/1.73m²', ref_low: 60, ref_high: 120 },
  ],
  'Thyroid Panel': [
    { analyte: 'TSH', unit: 'mIU/L', ref_low: 0.4, ref_high: 4.0 },
    { analyte: 'Free T4', unit: 'ng/dL', ref_low: 0.8, ref_high: 1.8 },
  ],
  'Lipid Panel': [
    { analyte: 'Total cholesterol', unit: 'mg/dL', ref_low: 0, ref_high: 200 },
    { analyte: 'LDL', unit: 'mg/dL', ref_low: 0, ref_high: 100 },
    { analyte: 'HDL', unit: 'mg/dL', ref_low: 40, ref_high: 90 },
    { analyte: 'Triglycerides', unit: 'mg/dL', ref_low: 0, ref_high: 150 },
  ],
  'Diabetes Panel': [
    { analyte: 'HbA1c', unit: '%', ref_low: 4.0, ref_high: 5.7 },
    { analyte: 'Fasting glucose', unit: 'mg/dL', ref_low: 70, ref_high: 100 },
  ],
  'Complete Blood Count': [
    { analyte: 'Haemoglobin', unit: 'g/dL', ref_low: 12, ref_high: 16 },
    { analyte: 'WBC', unit: '10³/µL', ref_low: 4.0, ref_high: 11.0 },
    { analyte: 'Platelets', unit: '10³/µL', ref_low: 150, ref_high: 400 },
  ],
};

/** Symptoms that should page the caretaker the moment they are logged. */
export const RED_FLAG_SYMPTOMS = [
  'Chest pain or tightness',
  'Breathlessness at rest',
  'Sudden severe headache',
  'Fainting or blackout',
  'Confusion or slurred speech',
  'Swelling of face or ankles',
  'Blood in urine or stool',
  'Persistent vomiting',
];

export const COMMON_SYMPTOMS = [
  'Fatigue',
  'Dizziness',
  'Headache',
  'Nausea',
  'Muscle cramps',
  'Poor sleep',
  'Low appetite',
  'Tingling in feet',
  'Joint pain',
  'Cough',
];
