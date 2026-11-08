import type { EventStatus } from '../services/apiTypes';

/** Local-time date helpers shared by the event calendar, list and form. */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in local time. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses `YYYY-MM-DD` as a local date; undefined when malformed. */
export function parseDateKey(key: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Splits an ISO timestamp into local `date` and `time` input values. */
export function isoToLocalInputs(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return { date: toDateKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** Combines local date and time inputs into an ISO string; undefined when invalid or date is empty. */
export function localInputsToIso(date: string, time: string): string | undefined {
  const day = parseDateKey(date);
  if (!day) return undefined;
  const t = /^(\d{2}):(\d{2})$/.exec(time || '00:00');
  if (!t) return undefined;
  day.setHours(Number(t[1]), Number(t[2]), 0, 0);
  return day.toISOString();
}

/** Start of the given local day as ISO (for `from` filters). */
export function startOfDayIso(key: string): string | undefined {
  return localInputsToIso(key, '00:00');
}

/** End of the given local day as ISO (for `to` filters). */
export function endOfDayIso(key: string): string | undefined {
  const day = parseDateKey(key);
  if (!day) return undefined;
  day.setHours(23, 59, 59, 999);
  return day.toISOString();
}

export function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Weeks (Monday first) covering the month of `month`. */
export function buildMonthWeeks(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weekCount = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weekCount }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}



export const EVENT_STATUSES: EventStatus[] = ['draft', 'scheduled', 'completed', 'cancelled'];
