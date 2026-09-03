# Verification harness

`verify.js` runs CareCircle's real logic on plain Node — no simulator, no phone — and asserts
the numbers it produces.

It does two things:

1. **Parses every source file** (JSX + ESM) so a syntax error cannot reach a device.
2. **Executes the actual database, seed, schedule, adherence, alert and pattern modules**
   against an in-memory SQLite, and checks the results — including that the patterns
   deliberately planted in the seed are the ones the engine finds.

It is not a substitute for opening the app, but it covers everything that is arithmetic
rather than pixels, which is where the mistakes that matter clinically live.

## Setup

The app's real dependencies are native modules that cannot load outside Expo, so the harness
needs a Babel toolchain and a set of test doubles.

```bash
# from anywhere outside the project
mkdir -p ~/carecircle-harness && cd ~/carecircle-harness
npm init -y
npm install @babel/core @babel/register @babel/preset-env @babel/preset-react @babel/parser
mkdir -p stubs
```

Create these files under `stubs/`. Each needs a `package.json` of
`{"name":"<name>","version":"0.0.0","main":"index.js"}` alongside its `index.js`.

**`stubs/expo-sqlite/index.js`** — the only substantial one. Backs the app's async API with
Node's built-in SQLite, so the schema, the seed and every query run for real:

```js
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
```

The rest are one-liners returning inert objects: `react-native`, `react-native-svg`,
`react-native-safe-area-context`, `expo`, `expo-status-bar`, `expo-print`, `expo-sharing`,
`expo-notifications` (needs `AndroidImportance`, `SchedulableTriggerInputTypes` and async
no-ops), `@react-native-async-storage/async-storage`, and the three `@react-navigation/*`
packages.

## Running

```bash
cd /path/to/carecircle
ln -s ~/carecircle-harness/node_modules node_modules   # if the app's deps aren't installed
NODE_PATH=~/carecircle-harness/stubs node tools/verify.js
```

Expected output ends with:

```
Result: 57 passed, 0 failed
```

Node 22 or newer is required for `node:sqlite`.

## What it covers

| Section | Checks |
| --- | --- |
| Parsing | all 39 source files |
| Dates | local wall-clock handling, the 06:30-must-stay-06:30 rule, month boundaries |
| Schema and seed | users, roles, PINs, treatment goals, rescue-vs-scheduled separation |
| Schedule | slot expansion, grace windows, day-of-week rules, start/end dates |
| Adherence | the formula, held doses excluded, totals reconcile, streaks, bounds |
| Planted patterns | the evening-dose gap and the weekend collapse are actually detected |
| Pattern engine | findings, ordering, lagged correlation, null results, lab severity grading |
| PDF | required sections present, HTML escaping of user text |
| Escalation | sweep converts overdue to missed, idempotency, dedupe keys, red flags, lab tiers |

## Note

`node tools/verify.js` is also wired up as `npm run verify`, but that only works once the
harness dependencies above are resolvable from the project.
