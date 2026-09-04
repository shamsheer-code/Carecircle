const { DatabaseSync } = require('node:sqlite');
const n = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
function wrap(raw) {
  return {
    async execAsync(sql) { raw.exec(sql); },
    async runAsync(sql, p = []) {
      const r = raw.prepare(sql).run(...p.map(n));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync(sql, p = []) { return raw.prepare(sql).all(...p.map(n)).map((o) => ({ ...o })); },
    async getFirstAsync(sql, p = []) { const r = raw.prepare(sql).get(...p.map(n)); return r ? { ...r } : null; },
    async withTransactionAsync(fn) {
      raw.exec('BEGIN');
      try { await fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}
let handle = null;
module.exports = { openDatabaseAsync: async () => (handle ||= wrap(new DatabaseSync(':memory:'))) };
