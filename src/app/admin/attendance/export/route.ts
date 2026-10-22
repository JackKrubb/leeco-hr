import { NextResponse, type NextRequest } from "next/server";
import { rpc, RpcError } from "@/lib/db";
import { getMe, getToken } from "@/lib/session";
import { fmtTime, fullName } from "@/lib/format";
import type { AttendanceReport } from "@/lib/attendance-report";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.employee.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const type = req.nextUrl.searchParams.get("type") === "detail" ? "detail" : "summary";

  let report: AttendanceReport;
  try {
    report = await rpc<AttendanceReport>("hr_admin_attendance", { p_token: await getToken(), p_from: from, p_to: to });
  } catch (e) {
    return new NextResponse(e instanceof RpcError ? e.code : "Error", { status: 400 });
  }

  const lines: unknown[][] =
    type === "summary"
      ? [
          ["รหัส", "ชื่อ", "ฝ่าย", "บริษัท", "วันทำงาน", "มา", "ขาด/ไม่ลงเวลา", "สาย (วัน)", "สายรวม (นาที)", "ไม่ลงเวลาออก"],
          ...report.summary.map((s) => [s.emp_code, s.name, s.work_group, s.company, s.workdays, s.present, s.absent, s.late_days, s.late_minutes, s.missing_checkout]),
        ]
      : [
          ["วันที่", "รหัส", "ชื่อ", "ฝ่าย", "เข้า", "ออก", "สาย (นาที)", "ระยะจากบริษัท (ม.)", "หมายเหตุ HR"],
          ...report.rows.map(({ employee: e, attendance: a }) => [
            a.work_date, e.emp_code, fullName(e), e.work_group, fmtTime(a.check_in_at), fmtTime(a.check_out_at),
            a.late_minutes, a.check_in_distance_m != null ? Math.round(a.check_in_distance_m) : "", a.admin_note,
          ]),
        ];

  // UTF-8 BOM so Excel shows Thai correctly
  const body = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${type}-${from}-to-${to}.csv"`,
    },
  });
}
