// CSV downloads for the admin reports (UTF-8 with BOM so Excel shows Thai correctly).
import { fmtTime, fullName } from "./format";
import type { AttendanceReport } from "./attendance-report";
import type { Attendance, Employee } from "./types";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(name: string, lines: unknown[][]) {
  const body = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `leeco-attendance-${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function summaryLines(r: AttendanceReport): unknown[][] {
  return [
    ["รหัส", "ชื่อ", "ฝ่าย", "บริษัท", "วันทำงาน", "มา", "ขาด/ไม่ลงเวลา", "สาย (ครั้ง)", "สาย (นาที)", "กลับพักสาย (ครั้ง)", "กลับพักสาย (นาที)", "ออกพักก่อน (ครั้ง)", "ออกพักก่อน (นาที)", "กลับก่อน (ครั้ง)", "กลับก่อน (นาที)", "ไม่ตอกพัก", "ไม่ลงเวลาออก"],
    ...r.summary.map((s) => [s.emp_code, s.name, s.work_group, s.company, s.workdays, s.present, s.absent, s.late_days, s.late_minutes, s.break_late_days, s.break_late_minutes, s.break_early_days, s.break_early_minutes, s.early_days, s.early_minutes, s.missing_break, s.missing_checkout]),
  ];
}

export function detailLines(r: AttendanceReport): unknown[][] {
  return [
    ["วันที่", "รหัส", "ชื่อ", "ฝ่าย", "เข้า", "พักเที่ยง", "กลับจากพัก", "ออก", "สาย (นาที)", "ออกพักก่อน (นาที)", "กลับพักสาย (นาที)", "กลับก่อน (นาที)", "ระยะจากบริษัท (ม.)", "หมายเหตุ HR"],
    ...[...r.rows].reverse().map(({ employee: e, attendance: a }) => [
      a.work_date, e.emp_code, fullName(e), e.work_group, fmtTime(a.check_in_at), fmtTime(a.break_out_at), fmtTime(a.break_in_at), fmtTime(a.check_out_at),
      a.late_minutes || "", a.break_early_minutes || "", a.break_late_minutes || "", a.early_minutes || "", a.check_in_distance_m != null ? Math.round(a.check_in_distance_m) : "", a.admin_note,
    ]),
  ];
}

export function dailyLines(date: string, today: string, isWorkday: boolean, rows: { employee: Employee; attendance: Attendance | null }[]): unknown[][] {
  return [
    ["วันที่", "รหัส", "ชื่อ", "ฝ่าย", "ตำแหน่ง", "เข้า", "พักเที่ยง", "กลับจากพัก", "ออก", "สาย (นาที)", "ออกพักก่อน (นาที)", "กลับพักสาย (นาที)", "กลับก่อน (นาที)", "สถานะ", "หมายเหตุ HR"],
    ...rows.map(({ employee: e, attendance: a }) => {
      const status = !a?.check_in_at
        ? isWorkday ? (date < today ? "ขาด/ไม่ลงเวลา" : "ยังไม่เข้างาน") : "วันหยุด"
        : [
            a.late_minutes > 0 && "สาย",
            a.break_early_minutes > 0 && "ออกพักก่อน",
            a.break_late_minutes > 0 && "กลับจากพักสาย",
            a.early_minutes > 0 && "กลับก่อน",
            isWorkday && date < today && (!a.break_out_at || !a.break_in_at) && "ไม่ตอกพัก",
            !a.check_out_at && date < today && "ไม่ลงเวลาออก",
          ].filter(Boolean).join(", ") || "ปกติ";
      return [
        date, e.emp_code, fullName(e), e.work_group, e.position,
        fmtTime(a?.check_in_at), fmtTime(a?.break_out_at), fmtTime(a?.break_in_at), fmtTime(a?.check_out_at),
        a?.late_minutes || "", a?.break_early_minutes || "", a?.break_late_minutes || "", a?.early_minutes || "", status, a?.admin_note,
      ];
    }),
  ];
}
