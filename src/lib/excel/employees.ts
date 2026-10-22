// Employee sheet → clean rows.
//
// Understands two layouts:
//  1. The clean template (public/templates/employees-template.xlsx): one header row with
//     รหัสพนักงาน / คำนำหน้า / ชื่อ / นามสกุล / ชื่อเล่น / ฝ่าย / แผนก / ตำแหน่ง / บริษัท / วันเริ่มงาน / หมายเหตุ
//  2. The existing HR sheet ("รายชื่อพนักงานทั้งหมดปัจจุบัน"): repeated header rows, section rows
//     such as "แผนกพับ" between blocks, ditto marks (,, / '') meaning "same as above",
//     dates like 6/3/67 in พ.ศ., the company cell carrying position allowance text, and
//     "รวม N คน" total rows.
// Pay data — wage columns (ค่าแรง / เงินเดือน), numeric notes, and position-allowance text in the
// company cell — is deliberately not imported: an attendance app doesn't need it.

import { type Cell, type Grid, type ParseIssue, findCol, headerKey, isDitto, parseDate, text } from "./cells";

export type EmployeeImportRow = {
  _row: number;
  emp_code?: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  nickname?: string;
  work_group?: string;
  department?: string;
  position?: string;
  company?: string;
  start_date?: string;
  note?: string;
  sort_order?: number;
};

export type EmployeeParseResult = {
  rows: EmployeeImportRow[];
  issues: ParseIssue[];
  ignoredColumns: string[];
};

const PREFIX_RE = /^(นางสาว|น\.ส\.|นส\.|นาย|นาง|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i;

const KNOWN_COMPANIES: { canonical: string; pattern: RegExp }[] = [
  { canonical: "เฮง", pattern: /เฮง/ },
  { canonical: "JPP", pattern: /jpp|เจพีพี/i },
  { canonical: "จิรสิน", pattern: /จ[ีิ]ร[ะ]?สิน/ },
  { canonical: "นอกระบบ", pattern: /นอกระบบ/ },
];

export function splitCompany(raw: string): { company?: string; extra?: string } {
  const t = text(raw);
  if (!t) return {};
  for (const c of KNOWN_COMPANIES) {
    const m = t.match(c.pattern);
    if (m) {
      const extra = (t.slice(0, m.index) + " " + t.slice((m.index ?? 0) + m[0].length))
        .replace(/^[\s+]+|[\s+]+$/g, "")
        .trim();
      return { company: c.canonical, extra: extra || undefined };
    }
  }
  return { company: t };
}

/** "นายพสุธา  วงษ์มณี" / "น.ส.อัจฉริยา" + "แสงปัญญา ( แพร )" → parts. */
export function splitName(firstCell: string, lastCell: string) {
  let first = text(firstCell);
  let last = text(lastCell);
  let nickname: string | undefined;

  const nick = (s: string) =>
    s.replace(/\(\s*([^)]+?)\s*\)/, (_, n: string) => {
      nickname = n.trim();
      return "";
    }).trim();
  first = nick(first);
  last = nick(last);

  let prefix: string | undefined;
  const pm = first.match(PREFIX_RE);
  if (pm) {
    prefix = pm[1].replace(/^นส\.$/, "น.ส.").replace(/^นางสาว$/, "น.ส.");
    first = first.slice(pm[0].length).trim();
  }
  if (!last && first.includes(" ")) {
    const [f, ...rest] = first.split(" ");
    first = f;
    last = rest.join(" ");
  }
  return { prefix, first_name: first, last_name: last, nickname };
}

function cleanSection(raw: string): string {
  return text(raw)
    .replace(/^แผนก\s*/, "")
    .replace(/^ออฟฟิต$/, "ออฟฟิศ")
    .replace(/^โชว์ลูม$/, "โชว์รูม");
}

type ColMap = {
  order: number;
  code: number;
  prefix: number;
  name: number; // combined "ชื่อ-นามสกุล" column (may spill into name+1)
  first: number;
  last: number;
  nickname: number;
  group: number;
  department: number;
  position: number;
  company: number;
  start: number;
  note: number;
};

function detectHeader(cells: Cell[]): { map: ColMap; ignored: string[] } | null {
  const h = cells.map(headerKey);
  const hasName = h.some((x) => x.includes("ชื่อ") || x === "name" || x === "firstname");
  const hasOther = h.some((x) =>
    ["ลำดับ", "วันเริ่ม", "ตำแหน่ง", "แผนก", "รหัส", "code", "no"].some((k) => x.includes(k)),
  );
  if (!hasName || !hasOther) return null;

  const combined = findCol(h, ["ชื่อ-นามสกุล", "ชื่อนามสกุล", "fullname"]);
  const map: ColMap = {
    order: findCol(h, ["ลำดับ", "no"], true),
    code: findCol(h, ["รหัสพนักงาน", "รหัส", "empcode", "code"]),
    prefix: findCol(h, ["คำนำหน้า", "prefix"]),
    name: combined,
    first: combined >= 0 ? -1 : findCol(h, ["ชื่อ", "firstname", "name"], true),
    last: combined >= 0 ? -1 : findCol(h, ["นามสกุล", "lastname", "surname"], true),
    nickname: findCol(h, ["ชื่อเล่น", "nickname"]),
    group: findCol(h, ["ฝ่าย", "กลุ่ม", "ส่วนงาน", "workgroup", "group"]),
    department: findCol(h, ["แผนก", "department"]),
    position: findCol(h, ["ตำแหน่ง", "position"]),
    company: findCol(h, ["ชื่อ-บริษัท", "บริษัท", "company"]),
    start: findCol(h, ["วันเริ่มงาน", "วันที่เริ่มงาน", "วันเริ่ม", "startdate", "start"]),
    note: findCol(h, ["หมายเหตุ", "note"]),
  };
  if (map.name < 0 && map.first < 0) return null;
  // "ชื่อ-บริษัท" also contains "ชื่อ": make sure the name column is not the company column
  if (map.name === map.company) map.name = -1;

  const ignored = cells
    .map((c) => text(c))
    .filter((t) => /ค่าแรง|เงินเดือน|salary|wage/i.test(t));
  return { map, ignored };
}

function isSectionRow(cells: Cell[]): string | null {
  const nonEmpty = cells.map((c, i) => [i, text(c)] as const).filter(([, t]) => t !== "");
  if (nonEmpty.length !== 1) return null;
  const [idx, t] = nonEmpty[0];
  if (idx === 0 && /^\d+$/.test(t)) return null;
  if (/รวม|=|\d+\s*คน|^\d+$/.test(t)) return null;
  if (t.length > 40) return null;
  return cleanSection(t);
}

export function parseEmployeeGrid(grid: Grid): EmployeeParseResult {
  const rows: EmployeeImportRow[] = [];
  const issues: ParseIssue[] = [];
  const ignoredColumns = new Set<string>();
  let map: ColMap | null = null;
  let section: string | undefined;
  let prev: Partial<Record<"position" | "department" | "company" | "group", string>> = {};
  const companies = new Set(["เฮง", "JPP", "จิรสิน", "นอกระบบ"]);
  const seen = new Map<string, number>();

  grid.forEach((cells, i) => {
    const rowNo = i + 1;
    const header = detectHeader(cells);
    if (header) {
      map = header.map;
      header.ignored.forEach((c) => ignoredColumns.add(c));
      return;
    }
    if (!map) return;
    const m: ColMap = map;

    const sec = isSectionRow(cells);
    if (sec) {
      section = sec;
      prev = {};
      return;
    }

    const get = (col: number) => (col >= 0 ? cells[col] : undefined);
    const orderText = text(get(m.order));
    let firstRaw = "";
    let lastRaw = "";
    if (m.name >= 0) {
      firstRaw = text(get(m.name));
      const next = get(m.name + 1);
      // In the HR sheet the surname sits in the unlabeled column right after ชื่อ-นามสกุล
      if (m.name + 1 !== m.start && m.name + 1 !== m.position && m.name + 1 !== m.department) {
        lastRaw = text(next);
      }
    } else {
      firstRaw = text(get(m.first));
      lastRaw = text(get(m.last));
    }

    if (!firstRaw || /รวม|=/.test(firstRaw)) return;
    if (m.order >= 0 && orderText && !/^\d+(\.0+)?$/.test(orderText)) return;
    if (m.order >= 0 && !orderText && m.code < 0) return; // stray text without a row number

    const name = splitName(firstRaw, lastRaw);
    if (!name.first_name) return;

    const pick = (col: number, key: keyof typeof prev): string | undefined => {
      const c = get(col);
      if (col < 0) return undefined;
      if (isDitto(c)) return prev[key];
      const t = text(c);
      return t || undefined;
    };

    let department = pick(m.department, "department");
    let position = pick(m.position, "position");
    // A ditto mark under a หัวหน้า row almost always means "same as the staff above it",
    // i.e. พนักงาน — a block rarely has several heads. Flag it for review.
    if (m.position >= 0 && isDitto(get(m.position)) && /หัวหน้า/.test(position ?? "")) {
      issues.push({ row: rowNo, level: "warn", message: `ตำแหน่งเป็น ,, ต่อจาก “${position}” — ตั้งเป็น “พนักงาน” (โปรดตรวจสอบ): ${name.first_name}` });
      position = "พนักงาน";
    }
    const companyRaw = pick(m.company, "company");
    let group = pick(m.group, "group");

    if (department && companies.has(splitCompany(department).company ?? "")) {
      issues.push({ row: rowNo, level: "warn", message: `แผนก "${department}" ดูเหมือนชื่อบริษัท — ใช้แผนกเดิม "${prev.department ?? section ?? "-"}" แทน` });
      department = prev.department ?? section;
    }
    if (!group) group = section;

    const { company, extra } = splitCompany(companyRaw ?? "");
    const startRaw = get(m.start);
    const start_date = parseDate(startRaw) ?? undefined;
    if (m.start >= 0 && text(startRaw) && !start_date) {
      issues.push({ row: rowNo, level: "warn", message: `อ่านวันเริ่มงาน "${text(startRaw)}" ไม่ได้` });
    }

    // In the HR sheet the "หมายเหตุ" column of later blocks actually holds daily wages —
    // a purely numeric note is treated as pay data and left out.
    const noteCell = text(get(m.note)).replace(/,/g, "");
    const noteText = /^\d+(\.\d+)?$/.test(noteCell) ? undefined : text(get(m.note)) || undefined;
    // Pay details riding along in the company cell (e.g. "+ค่าตำแหน่ง 1,000 บาท") are left out too.
    const extraText = extra && !/ค่า|บาท|\d/.test(extra) ? extra : undefined;
    const noteParts = [extraText, noteText].filter(Boolean);
    const row: EmployeeImportRow = {
      _row: rowNo,
      emp_code: text(get(m.code)) || undefined,
      prefix: text(get(m.prefix)) || name.prefix,
      first_name: name.first_name,
      last_name: name.last_name,
      nickname: text(get(m.nickname)) || name.nickname,
      work_group: group,
      department,
      position,
      company,
      start_date,
      note: noteParts.length ? noteParts.join(" / ") : undefined,
      sort_order: orderText ? Math.round(Number(orderText)) : undefined,
    };

    if (!row.last_name) issues.push({ row: rowNo, level: "warn", message: `ไม่มีนามสกุล: ${row.first_name}` });
    if (!row.start_date) issues.push({ row: rowNo, level: "warn", message: `ไม่มีวันเริ่มงาน: ${row.first_name} ${row.last_name}`.trim() });

    const key = (row.first_name + row.last_name).replace(/\s/g, "");
    if (seen.has(key)) {
      issues.push({ row: rowNo, level: "warn", message: `ชื่อซ้ำกับแถว ${seen.get(key)}: ${row.first_name} ${row.last_name}` });
    } else {
      seen.set(key, rowNo);
    }

    prev = {
      position: position ?? prev.position,
      department: department ?? prev.department,
      company: companyRaw ?? prev.company,
      group: group ?? prev.group,
    };
    rows.push(row);
  });

  if (!rows.length) {
    issues.push({ row: 0, level: "error", message: "ไม่พบรายชื่อพนักงานในชีตนี้ — ต้องมีแถวหัวตารางที่มีคำว่า “ชื่อ” และ “ลำดับ” หรือ “แผนก”" });
  }
  return { rows, issues, ignoredColumns: [...ignoredColumns] };
}
