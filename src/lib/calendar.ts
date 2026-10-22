import type { Holiday } from "./types";

/** ISO weekday 1 (Mon) … 7 (Sun) for a YYYY-MM-DD date. */
export function isoDow(iso: string) {
  return ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
}

export function monthDays(y: number, m: number) {
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

export function workdayChecker(workDays: number[], holidays: Holiday[]) {
  const off = new Set(holidays.filter((h) => h.company_off).map((h) => h.holiday_date));
  return (iso: string) => workDays.includes(isoDow(iso)) && !off.has(iso);
}

export function parseMonthParam(v: unknown, today: string) {
  const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})$/) : null;
  const y = m ? +m[1] : +today.slice(0, 4);
  const mo = m ? Math.min(12, Math.max(1, +m[2])) : +today.slice(5, 7);
  const key = `${y}-${String(mo).padStart(2, "0")}`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { y, mo, key, from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function thaiMonth(y: number, m: number) {
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 15)));
}
