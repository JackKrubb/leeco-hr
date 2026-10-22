"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rpc } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { actionError } from "@/lib/action-error";
import { readWorkbook } from "@/lib/excel/read-workbook";
import { parseEmployeeGrid, type EmployeeImportRow } from "@/lib/excel/employees";
import { parseHolidayGrid, type HolidayImportRow } from "@/lib/excel/holidays";
import type { ParseIssue } from "@/lib/excel/cells";
import type { ActionResult } from "@/lib/types";
import type { FormState } from "./auth";

const MAX_UPLOAD = 8 * 1024 * 1024;

function stripRow<T extends { _row: number }>(r: T): Omit<T, "_row"> {
  const rest: Partial<T> = { ...r };
  delete rest._row;
  return rest as Omit<T, "_row">;
}

async function loadUpload(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("เลือกไฟล์ Excel ก่อน");
  if (file.size > MAX_UPLOAD) throw new Error("ไฟล์ใหญ่เกิน 8 MB");
  const wb = await readWorkbook(file.name, await file.arrayBuffer());
  if (!wb.sheets.length) throw new Error("ไม่พบชีตในไฟล์");
  const wanted = String(fd.get("sheet") ?? "");
  const sheet = wb.sheets.find((s) => s.name === wanted) ?? wb.sheets[0];
  return { fileName: file.name, sheetNames: wb.sheets.map((s) => s.name), sheet };
}

// ---------------------------------------------------------------- employees

export type EmployeePreview = {
  fileName: string;
  sheetNames: string[];
  sheet: string;
  rows: EmployeeImportRow[];
  issues: ParseIssue[];
  ignoredColumns: string[];
};

export async function previewEmployeesAction(fd: FormData): Promise<ActionResult<EmployeePreview>> {
  await requireAdmin();
  try {
    const { fileName, sheetNames, sheet } = await loadUpload(fd);
    const res = parseEmployeeGrid(sheet.grid);
    return { ok: true, data: { fileName, sheetNames, sheet: sheet.name, ...res } };
  } catch (e) {
    return actionError(e);
  }
}

export type EmployeeImportSummary = {
  inserted: number;
  updated: number;
  deactivated: number;
  results: { emp_code: string; name: string; action: "inserted" | "updated" }[];
};

export async function commitEmployeesAction(
  rows: EmployeeImportRow[],
  deactivateMissing: boolean,
  fileName: string,
): Promise<ActionResult<EmployeeImportSummary>> {
  const { token } = await requireAdmin();
  try {
    const clean = rows.map(stripRow);
    const data = await rpc<EmployeeImportSummary>("hr_admin_import_employees", {
      p_token: token,
      p_rows: clean,
      p_deactivate_missing: deactivateMissing,
      p_file_name: fileName,
    });
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (e) {
    return actionError(e);
  }
}

export type PinSlip = { emp_code: string; prefix?: string | null; name: string; work_group?: string | null; pin: string };

export async function generatePinsAction(): Promise<ActionResult<PinSlip[]>> {
  const { token } = await requireAdmin();
  try {
    const data = await rpc<PinSlip[]>("hr_admin_generate_missing_pins", { p_token: token });
    revalidatePath("/admin/employees");
    return { ok: true, data };
  } catch (e) {
    return actionError(e);
  }
}

export async function resetPinAction(employeeId: string): Promise<ActionResult<PinSlip>> {
  const { token } = await requireAdmin();
  try {
    const data = await rpc<PinSlip>("hr_admin_reset_pin", { p_token: token, p_employee_id: employeeId });
    revalidatePath("/admin/employees");
    return { ok: true, data };
  } catch (e) {
    return actionError(e);
  }
}

export async function saveEmployeeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { token } = await requireAdmin();
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const payload = {
    id: s("id") || null,
    emp_code: s("emp_code"),
    prefix: s("prefix"),
    first_name: s("first_name"),
    last_name: s("last_name"),
    nickname: s("nickname"),
    work_group: s("work_group"),
    department: s("department"),
    position: s("position"),
    company: s("company"),
    start_date: s("start_date"),
    note: s("note"),
    sort_order: s("sort_order"),
    role: s("role") || "employee",
    track_attendance: fd.get("track_attendance") === "on",
    active: fd.get("active") === "on",
  };
  try {
    await rpc("hr_admin_save_employee", { p_token: token, p: payload });
  } catch (e) {
    return { error: actionError(e).error };
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/employees");
}

// ---------------------------------------------------------------- holidays

export type HolidayPreview = {
  fileName: string;
  sheetNames: string[];
  sheet: string;
  rows: HolidayImportRow[];
  issues: ParseIssue[];
};

export async function previewHolidaysAction(fd: FormData): Promise<ActionResult<HolidayPreview>> {
  await requireAdmin();
  try {
    const { fileName, sheetNames, sheet } = await loadUpload(fd);
    const res = parseHolidayGrid(sheet.grid);
    return { ok: true, data: { fileName, sheetNames, sheet: sheet.name, ...res } };
  } catch (e) {
    return actionError(e);
  }
}

export async function commitHolidaysAction(
  rows: HolidayImportRow[],
  replaceYears: boolean,
  fileName: string,
): Promise<ActionResult<{ saved: number; deleted: number }>> {
  const { token } = await requireAdmin();
  try {
    const clean = rows.map(stripRow);
    const data = await rpc<{ saved: number; deleted: number }>("hr_admin_import_holidays", {
      p_token: token,
      p_rows: clean,
      p_replace_years: replaceYears,
      p_file_name: fileName,
    });
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return actionError(e);
  }
}

export async function saveHolidayAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { token } = await requireAdmin();
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  try {
    await rpc("hr_admin_save_holiday", {
      p_token: token,
      p: {
        id: s("id") || null,
        holiday_date: s("holiday_date"),
        name: s("name"),
        type: s("type") === "public" ? "public" : "company",
        company_off: fd.get("company_off") === "on",
        note: s("note"),
      },
    });
  } catch (e) {
    return { error: actionError(e).error };
  }
  revalidatePath("/", "layout");
  return { message: "บันทึกแล้ว" };
}

export async function deleteHolidayAction(id: string) {
  const { token } = await requireAdmin();
  await rpc("hr_admin_delete_holiday", { p_token: token, p_id: id });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- attendance

export async function editAttendanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { token } = await requireAdmin();
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  if (!s("employee_id") || !s("work_date")) return { error: "เลือกพนักงานและวันที่" };
  try {
    await rpc("hr_admin_edit_attendance", {
      p_token: token,
      p_employee_id: s("employee_id"),
      p_work_date: s("work_date"),
      p_check_in: s("check_in") || null,
      p_check_out: s("check_out") || null,
      p_note: s("note") || null,
    });
  } catch (e) {
    return { error: actionError(e).error };
  }
  revalidatePath("/admin", "layout");
  return { message: "บันทึกเวลาแล้ว" };
}

// ---------------------------------------------------------------- settings

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { token } = await requireAdmin();
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const workDays = fd.getAll("work_days").map((v) => Number(v)).filter((n) => n >= 1 && n <= 7);
  try {
    await rpc("hr_admin_save_settings", {
      p_token: token,
      p: {
        company_name: s("company_name"),
        work_start: s("work_start"),
        work_end: s("work_end"),
        late_grace_minutes: s("late_grace_minutes"),
        work_days: workDays,
        require_location: fd.get("require_location") === "on",
        require_pin: fd.get("require_pin") === "on",
        site_lat: s("site_lat"),
        site_lng: s("site_lng"),
        site_radius_m: s("site_radius_m"),
      },
    });
  } catch (e) {
    return { error: actionError(e).error };
  }
  revalidatePath("/", "layout");
  return { message: "บันทึกการตั้งค่าแล้ว" };
}
