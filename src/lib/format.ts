const TZ = "Asia/Bangkok";

/** "22 ต.ค. 2569" */
export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "-";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00+07:00") : new Date(iso);
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", ...opts }).format(d);
}

/** "พฤหัสบดี 22 ตุลาคม 2569" */
export function fmtDateLong(iso: string) {
  return fmtDate(iso, { weekday: "long", month: "long" });
}

/** "08:02" */
export function fmtTime(iso: string | null | undefined) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function fmtDuration(fromIso: string | null, toIso: string | null) {
  if (!fromIso || !toIso) return "";
  const mins = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
  if (mins <= 0) return "";
  return `${Math.floor(mins / 60)} ชม. ${mins % 60} น.`;
}

/** Today's date in Bangkok as YYYY-MM-DD. */
export function bkkToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fullName(e: { prefix?: string | null; first_name: string; last_name: string; nickname?: string | null }, withNick = true) {
  const name = `${e.prefix ?? ""}${e.first_name} ${e.last_name}`.trim();
  return withNick && e.nickname ? `${name} (${e.nickname})` : name;
}

export const WEEKDAYS_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]; // ISO 1..7
export const WEEKDAYS_LONG = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
