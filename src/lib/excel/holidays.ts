// Holiday sheet → clean rows.
// Template columns: วันที่ | ชื่อวันหยุด | ประเภท (ราชการ / บริษัท) | บริษัทหยุด (ใช่ / ไม่) | หมายเหตุ
// Without a header row, column A is read as the date and column B as the name.

import { type Grid, type ParseIssue, findCol, headerKey, parseBool, parseDate, text } from "./cells";

export type HolidayImportRow = {
  _row: number;
  holiday_date: string;
  name: string;
  type: "public" | "company";
  company_off: boolean;
  note?: string;
};

export type HolidayParseResult = { rows: HolidayImportRow[]; issues: ParseIssue[] };

export function parseHolidayType(raw: string): "public" | "company" {
  const t = raw.toLowerCase();
  if (/ราชการ|นักขัต|public|government|รัฐ/.test(t)) return "public";
  return "company";
}

export function parseHolidayGrid(grid: Grid): HolidayParseResult {
  const rows: HolidayImportRow[] = [];
  const issues: ParseIssue[] = [];
  let cols = { date: 0, name: 1, type: -1, off: -1, note: -1 };
  let headerFound = false;

  grid.forEach((cells, i) => {
    const rowNo = i + 1;
    const h = cells.map(headerKey);
    if (!headerFound && h.some((x) => x.includes("วันที่") || x === "date")) {
      const date = findCol(h, ["วันที่", "date"]);
      const name = findCol(h, ["ชื่อวันหยุด", "วันหยุด", "ชื่อ", "name", "holiday"]);
      cols = {
        date,
        name: name === date ? findCol(h, ["ชื่อวันหยุด", "ชื่อ", "name"]) : name,
        type: findCol(h, ["ประเภท", "type"]),
        off: findCol(h, ["บริษัทหยุด", "หยุดงาน", "companyoff", "off"]),
        note: findCol(h, ["หมายเหตุ", "note"]),
      };
      headerFound = true;
      return;
    }

    const rawDate = cols.date >= 0 ? cells[cols.date] : undefined;
    const name = cols.name >= 0 ? text(cells[cols.name]) : "";
    if (!text(rawDate) && !name) return;

    const holiday_date = parseDate(rawDate ?? null);
    if (!holiday_date) {
      if (text(rawDate)) issues.push({ row: rowNo, level: "warn", message: `อ่านวันที่ "${text(rawDate)}" ไม่ได้ — ข้ามแถวนี้` });
      return;
    }
    if (!name) {
      issues.push({ row: rowNo, level: "warn", message: `แถววันที่ ${holiday_date} ไม่มีชื่อวันหยุด — ข้ามแถวนี้` });
      return;
    }
    const type = cols.type >= 0 ? parseHolidayType(text(cells[cols.type])) : "company";
    rows.push({
      _row: rowNo,
      holiday_date,
      name,
      type,
      company_off: cols.off >= 0 ? parseBool(cells[cols.off], true) : true,
      note: cols.note >= 0 ? text(cells[cols.note]) || undefined : undefined,
    });
  });

  const seen = new Set<string>();
  for (const r of rows) {
    const k = r.holiday_date + r.name;
    if (seen.has(k)) issues.push({ row: r._row, level: "warn", message: `ซ้ำ: ${r.holiday_date} ${r.name}` });
    seen.add(k);
  }
  if (!rows.length) issues.push({ row: 0, level: "error", message: "ไม่พบวันหยุดในไฟล์ — ต้องมีคอลัมน์ “วันที่” และ “ชื่อวันหยุด”" });
  return { rows, issues };
}
