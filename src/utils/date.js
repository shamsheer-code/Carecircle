/**
 * All timestamps in CareCircle are *local wall-clock* strings, never UTC.
 *
 * A dose scheduled for 06:30 must stay 06:30 if the phone crosses a timezone,
 * so we deliberately avoid Date.toISOString() (which shifts to UTC) and format
 * from the local components instead.
 *
 *   date key  -> 'YYYY-MM-DD'
 *   timestamp -> 'YYYY-MM-DDTHH:MM'
 */

const pad = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function stamp(d = new Date()) {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' into a local Date. */
export function parse(s) {
  if (!s) return null;
  const [datePart, timePart = '00:00'] = String(s).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export function addDays(d, n) {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
}

export function startOfDay(d = new Date()) {
  const c = new Date(d.getTime());
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Whole days between two date keys (b - a). */
export function daysBetween(aKey, bKey) {
  const a = startOfDay(parse(aKey));
  const b = startOfDay(parse(bKey));
  return Math.round((b - a) / 86400000);
}

/** Inclusive list of 'YYYY-MM-DD' keys. */
export function dateRange(fromKey, toKey) {
  const out = [];
  let cur = startOfDay(parse(fromKey));
  const end = startOfDay(parse(toKey));
  while (cur <= end) {
    out.push(dateKey(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(s) {
  const d = parse(s);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShortDate(s) {
  const d = parse(s);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** '06:30' -> '6:30 AM' */
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${period}`;
}

export function fmtDateTime(s) {
  if (!s) return '—';
  const [datePart, timePart] = String(s).split('T');
  return timePart ? `${fmtShortDate(datePart)}, ${fmtTime(timePart)}` : fmtShortDate(datePart);
}

export function timeOf(ts) {
  const parts = String(ts || '').split('T');
  return parts[1] || '';
}

export function dayOf(ts) {
  return String(ts || '').split('T')[0];
}

export function relative(s) {
  const d = parse(s);
  if (!d) return '—';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return 'yesterday';
  if (diffD < 30) return `${diffD}d ago`;
  return fmtShortDate(dayOf(s));
}

/** Human bucket for a dose time — drives the "evening doses get missed" pattern. */
export function timeBucket(hhmm) {
  const h = Number(String(hhmm).split(':')[0]);
  if (h < 11) return 'Morning';
  if (h < 16) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}

export function age(dob) {
  const d = parse(dob);
  if (!d) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1;
  return a;
}
