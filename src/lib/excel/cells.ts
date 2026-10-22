// Shared helpers for turning messy spreadsheet cells into clean values.
// Kept free of Excel/Node APIs so the parsers can be unit-tested on plain arrays.

export type Cell = string | number | boolean | Date | null | undefined;
export type Grid = Cell[][];

export type ParseIssue = { row: number; level: "warn" | "error"; message: string };

/** Trim, collapse runs of whitespace and normalise to a plain string. */
export function text(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return isoDate(c) ?? "";
  return String(c).replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Header cells compared without spaces, case or punctuation noise. */
export function headerKey(c: Cell): string {
  return text(c).toLowerCase().replace(/[\s._]/g, "");
}

/** Ditto marks used in the HR sheets to mean "same as the row above". */
export function isDitto(c: Cell): boolean {
  const t = text(c);
  return /^(,,|''|"|”|“|〃|-"-|〃〃)$/.test(t);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function isoDate(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  // Excel dates come back as UTC midnight; use the UTC parts so the day never shifts.
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return isoDate(dt);
}

/** Turn a year as written in a Thai sheet into a Gregorian year. */
export function toGregorianYear(y: number): number {
  if (y < 100) return 2500 + y - 543; // "67" → พ.ศ. 2567 → 2024
  if (y >= 2400) return y - 543; // พ.ศ. 4 digits
  return y; // already ค.ศ.
}

const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1, มกราคม: 1, "ก.พ.": 2, กุมภาพันธ์: 2, "มี.ค.": 3, มีนาคม: 3, "เม.ย.": 4, เมษายน: 4,
  "พ.ค.": 5, พฤษภาคม: 5, "มิ.ย.": 6, มิถุนายน: 6, "ก.ค.": 7, กรกฎาคม: 7, "ส.ค.": 8, สิงหาคม: 8,
  "ก.ย.": 9, กันยายน: 9, "ต.ค.": 10, ตุลาคม: 10, "พ.ย.": 11, พฤศจิกายน: 11, "ธ.ค.": 12, ธันวาคม: 12,
};

/**
 * Accepts: real Excel dates, Excel serial numbers, "6/3/67" (d/m/พ.ศ. 2 digits),
 * "06/03/2567", "6/3/2024", "2026-01-01", "1 ม.ค. 2569".
 */
export function parseDate(c: Cell): string | null {
  if (c === null || c === undefined || c === "") return null;
  if (c instanceof Date) return isoDate(c);
  if (typeof c === "number") {
    if (c > 20000 && c < 80000) {
      // Excel serial date (days since 1899-12-30)
      return isoDate(new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000));
    }
    return null;
  }
  const t = text(c);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYmd(toGregorianYear(+m[1]), +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return validYmd(toGregorianYear(+m[3]), +m[2], +m[1]);
  m = t.match(/^(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})$/);
  if (m) {
    const month = THAI_MONTHS[m[2]] ?? THAI_MONTHS[m[2] + "."];
    if (month) return validYmd(toGregorianYear(+m[3]), month, +m[1]);
  }
  return null;
}

/** Find the first column whose header matches one of the candidate keys. */
export function findCol(headers: string[], candidates: string[], exact = false): number {
  for (const cand of candidates) {
    const k = cand.toLowerCase().replace(/[\s._]/g, "");
    const i = headers.findIndex((h) => (exact ? h === k : h === k || (h.length > 0 && h.includes(k))));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseBool(c: Cell, fallback: boolean): boolean {
  const t = text(c).toLowerCase();
  if (!t) return fallback;
  if (/^(ใช่|หยุด|y|yes|true|1|✓|✔|x)$/.test(t)) return true;
  if (/^(ไม่|ไม่หยุด|ทำงาน|n|no|false|0|-)$/.test(t)) return false;
  return fallback;
}
