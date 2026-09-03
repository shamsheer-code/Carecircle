import * as SQLite from 'expo-sqlite';
import { CREATE_SQL, SCHEMA_VERSION } from './schema';
import { seedIfEmpty } from './seed';

const DB_NAME = 'carecircle.db';

let dbPromise = null;

/** Singleton handle. Every query goes through this. */
export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

export async function initDatabase({ withSeed = true } = {}) {
  const db = await getDb();
  await db.execAsync(CREATE_SQL);

  const row = await db.getFirstAsync(`SELECT value FROM meta WHERE key = 'schema_version'`);
  if (!row) {
    await db.runAsync(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`, [
      String(SCHEMA_VERSION),
    ]);
  }

  if (withSeed) {
    await seedIfEmpty(db);
  }
  return db;
}

/** Destructive — used by the "Reset demo data" action in Settings. */
export async function resetDatabase() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS lab_results;
    DROP TABLE IF EXISTS lab_panels;
    DROP TABLE IF EXISTS dose_logs;
    DROP TABLE IF EXISTS medications;
    DROP TABLE IF EXISTS appointments;
    DROP TABLE IF EXISTS symptoms;
    DROP TABLE IF EXISTS vitals;
    DROP TABLE IF EXISTS alerts;
    DROP TABLE IF EXISTS conditions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS meta;
    PRAGMA foreign_keys = ON;
  `);
  await db.execAsync(CREATE_SQL);
  await db.runAsync(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`, [
    String(SCHEMA_VERSION),
  ]);
  await seedIfEmpty(db);
  return db;
}

/* ---------- thin query helpers, so screens never touch SQLite directly ---------- */

export async function all(sql, params = []) {
  const db = await getDb();
  return db.getAllAsync(sql, params);
}

export async function one(sql, params = []) {
  const db = await getDb();
  return db.getFirstAsync(sql, params);
}

export async function run(sql, params = []) {
  const db = await getDb();
  return db.runAsync(sql, params);
}

export async function scalar(sql, params = [], key) {
  const row = await one(sql, params);
  if (!row) return null;
  return key ? row[key] : Object.values(row)[0];
}
