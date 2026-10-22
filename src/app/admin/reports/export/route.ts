import { NextResponse, type NextRequest } from "next/server";
import { rpc, RpcError } from "@/lib/db";
import { getMe, getToken } from "@/lib/session";
import { fmtTime, fullName } from "@/lib/format";
import { parseMonthParam } from "@/lib/calendar";
import type { AttendanceReport } from "@/lib/attendance-report";
import type { Attendance, Employee } from "@/lib/types";

// CSV downloads for the admin reports. UTF-8 with BOM so Excel shows Thai correctly.
//   ?type=daily&date=YYYY-MM-DD      everyone for one day, including people who didn't check in
//   ?type=monthly&m=YYYY-MM          per-person totals for a month
//   ?type=summary&from=…&to=…        per-person totals for any range
//   ?type=detail&from=…&to=…         every check-in row in a range

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const SUMMARY_HEAD = ["รหัส", "ชื่อ", "ฝ่าย", "บริษัท", "วันทำงาน", "มา", "ขาด/ไม่ลงเวลา", "สาย (ครั้ง)", "สาย (นาที)", "กลับก่อน (ครั้ง)", "กลับก่อน (นาที)", "ไม่ลงเวลาออก"];
const summaryRows = (r: AttendanceReport) =>
  r.summary.map((s) => [s.emp_code, s.name, s.work_group, s.company, s.workdays, s.present, s.absent, s.late_days, s.late_minutes, s.early_days, s.early_minutes, s.missing_checkout]);

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.employee.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const token = await getToken();
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "summary";

  let lines: unknown[][];
  let name: string;
  try {
    if (type === "daily") {
      const date = sp.get("date");
      if (!isDate(date)) return new NextResponse("bad date", { status: 400 });
      const d = await rpc<{ is_workday: boolean; today: string; rows: { employee: Employee; attendance: Attendance | null }[] }>(
        "hr_admin_dashboard",
        { p_token: token, p_date: date },
      );
      lines = [
        ["วันที่", "รหัส", "ชื่อ", "ฝ่าย", "ตำแหน่ง", "เข้า", "ออก", "สาย (นาที)", "กลับก่อน (นาที)", "สถานะ", "หมายเหตุ HR"],
        ...d.rows.map(({ employee: e, attendance: a }) => {
          const status = !a?.check_in_at
            ? d.is_workday ? (date < d.today ? "ขาด/ไม่ลงเวลา" : "ยังไม่เข้างาน") : "วันหยุด"
            : [a.late_minutes > 0 && "สาย", a.early_minutes > 0 && "กลับก่อน", !a.check_out_at && date < d.today && "ไม่ลงเวลาออก"].filter(Boolean).join(", ") || "ปกติ";
          return [date, e.emp_code, fullName(e), e.work_group, e.position, fmtTime(a?.check_in_at), fmtTime(a?.check_out_at), a?.late_minutes || "", a?.early_minutes || "", status, a?.admin_note];
        }),
      ];
      name = `daily-${date}`;
    } else {
      let from = sp.get("from");
      let to = sp.get("to");
      if (type === "monthly") ({ from, to } = parseMonthParam(sp.get("m"), new Date().toISOString().slice(0, 10)));
      if (!isDate(from) || !isDate(to)) return new NextResponse("bad range", { status: 400 });
      const r = await rpc<AttendanceReport>("hr_admin_attendance", { p_token: token, p_from: from, p_to: to });
      if (type === "detail") {
        lines = [
          ["วันที่", "รหัส", "ชื่อ", "ฝ่าย", "เข้า", "ออก", "สาย (นาที)", "กลับก่อน (นาที)", "ระยะจากบริษัท (ม.)", "หมายเหตุ HR"],
          ...[...r.rows].reverse().map(({ employee: e, attendance: a }) => [
            a.work_date, e.emp_code, fullName(e), e.work_group, fmtTime(a.check_in_at), fmtTime(a.check_out_at),
            a.late_minutes || "", a.early_minutes || "", a.check_in_distance_m != null ? Math.round(a.check_in_distance_m) : "", a.admin_note,
          ]),
        ];
        name = `detail-${from}-to-${to}`;
      } else {
        lines = [SUMMARY_HEAD, ...summaryRows(r)];
        name = type === "monthly" ? `monthly-${from.slice(0, 7)}` : `summary-${from}-to-${to}`;
      }
    }
  } catch (e) {
    return new NextResponse(e instanceof RpcError ? e.code : "Error", { status: 400 });
  }

  const body = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leeco-attendance-${name}.csv"`,
    },
  });
}
