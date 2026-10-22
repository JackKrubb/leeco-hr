// Admin mutations, run in the browser with the signed-in admin's token.
import { authed, invalidate, messageOf } from "../api";
import { readWorkbook } from "../excel/read-workbook";
import { parseEmployeeGrid, type EmployeeImportRow } from "../excel/employees";
import { parseHolidayGrid, type HolidayImportRow } from "../excel/holidays";
import type { ParseIssue } from "../excel/cells";
import type { ActionResult } from "../types";
import type { FormState } from "./auth";

const MAX_UPLOAD = 8 * 1024 * 1024;

function stripRow<T extends { _row: number }>(r: T): Omit<T, "_row"> {
  const rest: Partial<T> = { ...r };
  delete rest._row;
  return rest as Omit<T, "_row">;
}

async function loadUpload(file: File, wanted?: string) {
  if (file.size === 0) throw new Error("เลือกไฟล์ Excel ก่อน");
  if (file.size > MAX_UPLOAD) throw new Error("ไฟล์ใหญ่เกิน 8 MB");
  const wb = await readWorkbook(file.name, await file.arrayBuffer());
  if (!wb.sheets.length) throw new Error("ไม่พบชีตในไฟล์");
  const sheet = wb.sheets.find((s) => s.name === wanted) ?? wb.sheets[0];
  return { fileName: file.name, sheetNames: wb.sheets.map((s) => s.name), sheet };
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------------------------------------------------------------- employees

export type EmployeePreview = {
  fileName: string;
  sheetNames: string[];
  sheet: string;
  rows: EmployeeImportRow[];
  issues: ParseIssue[];
  ignoredColumns: string[];
};

export const previewEmployees = (file: File, sheet?: string) =>
  run<EmployeePreview>(async () => {
    const { fileName, sheetNames, sheet: ws } = await loadUpload(file, sheet);
    return { fileName, sheetNames, sheet: ws.name, ...parseEmployeeGrid(ws.grid) };
  });

export type EmployeeImportSummary = {
  inserted: number;
  updated: number;
  deactivated: number;
  results: { emp_code: string; name: string; action: "inserted" | "updated" }[];
};

export const commitEmployees = (rows: EmployeeImportRow[], deactivateMissing: boolean, fileName: string) =>
  run(async () => {
    const data = await authed<EmployeeImportSummary>("hr_admin_import_employees", {
      p_rows: rows.map(stripRow),
      p_deactivate_missing: deactivateMissing,
      p_file_name: fileName,
    });
    invalidate();
    return data;
  });

export type PinSlip = { emp_code: string; prefix?: string | null; name: string; work_group?: string | null; pin: string };

export const resetPin = (employeeId: string) =>
  run(async () => {
    const data = await authed<PinSlip>("hr_admin_reset_pin", { p_employee_id: employeeId });
    invalidate();
    return data;
  });

export async function saveEmployeeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const payload = {
    id: s(fd, "id") || null,
    emp_code: s(fd, "emp_code"),
    prefix: s(fd, "prefix"),
    first_name: s(fd, "first_name"),
    last_name: s(fd, "last_name"),
    nickname: s(fd, "nickname"),
    work_group: s(fd, "work_group"),
    department: s(fd, "department"),
    position: s(fd, "position"),
    company: s(fd, "company"),
    start_date: s(fd, "start_date"),
    note: s(fd, "note"),
    sort_order: s(fd, "sort_order"),
    role: s(fd, "role") || "employee",
    track_attendance: fd.get("track_attendance") === "on",
    active: fd.get("active") === "on",
  };
  try {
    await authed("hr_admin_save_employee", { p: payload });
  } catch (e) {
    return { error: messageOf(e) };
  }
  invalidate();
  return { redirectTo: "/admin/employees/" };
}

// ---------------------------------------------------------------- holidays

export type HolidayPreview = {
  fileName: string;
  sheetNames: string[];
  sheet: string;
  rows: HolidayImportRow[];
  issues: ParseIssue[];
};

export const previewHolidays = (file: File, sheet?: string) =>
  run<HolidayPreview>(async () => {
    const { fileName, sheetNames, sheet: ws } = await loadUpload(file, sheet);
    return { fileName, sheetNames, sheet: ws.name, ...parseHolidayGrid(ws.grid) };
  });

export const commitHolidays = (rows: HolidayImportRow[], replaceYears: boolean, fileName: string) =>
  run(async () => {
    const data = await authed<{ saved: number; deleted: number }>("hr_admin_import_holidays", {
      p_rows: rows.map(stripRow),
      p_replace_years: replaceYears,
      p_file_name: fileName,
    });
    invalidate();
    return data;
  });

export async function saveHolidayAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await authed("hr_admin_save_holiday", {
      p: {
        id: s(fd, "id") || null,
        holiday_date: s(fd, "holiday_date"),
        name: s(fd, "name"),
        type: s(fd, "type") === "public" ? "public" : "company",
        company_off: fd.get("company_off") === "on",
        note: s(fd, "note"),
      },
    });
  } catch (e) {
    return { error: messageOf(e) };
  }
  invalidate();
  return { message: "บันทึกแล้ว" };
}

export const deleteHoliday = (id: string) =>
  run(async () => {
    await authed("hr_admin_delete_holiday", { p_id: id });
    invalidate();
  });

// ---------------------------------------------------------------- attendance

export async function editAttendanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!s(fd, "employee_id") || !s(fd, "work_date")) return { error: "เลือกพนักงานและวันที่" };
  try {
    await authed("hr_admin_edit_attendance_v2", {
      p_employee_id: s(fd, "employee_id"),
      p_work_date: s(fd, "work_date"),
      p_check_in: s(fd, "check_in") || null,
      p_break_out: s(fd, "break_out") || null,
      p_break_in: s(fd, "break_in") || null,
      p_check_out: s(fd, "check_out") || null,
      p_note: s(fd, "note") || null,
    });
  } catch (e) {
    return { error: messageOf(e) };
  }
  invalidate();
  return { message: "บันทึกเวลาแล้ว" };
}

export const reviewMonth = (month: string, reviewed: boolean) =>
  run(async () => {
    const data = await authed<{ purged: number }>("hr_admin_review_month", { p_month: month, p_reviewed: reviewed });
    invalidate();
    return data;
  });

// ---------------------------------------------------------------- settings

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const workDays = fd.getAll("work_days").map((v) => Number(v)).filter((n) => n >= 1 && n <= 7);
  try {
    await authed("hr_admin_save_settings", {
      p: {
        company_name: s(fd, "company_name"),
        work_start: s(fd, "work_start"),
        work_end: s(fd, "work_end"),
        break_start: s(fd, "break_start"),
        break_end: s(fd, "break_end"),
        late_grace_minutes: s(fd, "late_grace_minutes"),
        work_days: workDays,
        require_location: fd.get("require_location") === "on",
        site_lat: s(fd, "site_lat"),
        site_lng: s(fd, "site_lng"),
        site_radius_m: s(fd, "site_radius_m"),
      },
    });
  } catch (e) {
    return { error: messageOf(e) };
  }
  invalidate();
  return { message: "บันทึกการตั้งค่าแล้ว" };
}

export const rotateKioskKey = () =>
  run(async () => {
    const data = await authed<{ kiosk_key: string }>("hr_admin_kiosk", { p_rotate: true });
    invalidate();
    return data;
  });
