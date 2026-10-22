import { requireAdmin } from "@/lib/session";
import { rpc } from "@/lib/db";
import { bkkToday, fmtDate, fmtTime, fullName } from "@/lib/format";
import type { Employee } from "@/lib/types";
import type { AttendanceReport } from "@/lib/attendance-report";
import { EditAttendanceForm } from "./edit-form";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function AttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  const { token } = await requireAdmin();
  const sp = await searchParams;
  const today = bkkToday();
  const from = isDate(sp.from) ? sp.from : today.slice(0, 8) + "01";
  const to = isDate(sp.to) ? sp.to : today;
  const [report, employees] = await Promise.all([
    rpc<AttendanceReport>("hr_admin_attendance", { p_token: token, p_from: from, p_to: to }),
    rpc<Employee[]>("hr_admin_employees", { p_token: token }),
  ]);
  const qs = `from=${from}&to=${to}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">รายงานตามช่วงวันที่ · แก้ไขเวลา</p>
          <h1 className="h1">{fmtDate(from)} – {fmtDate(to)}</h1>
        </div>
        <form className="no-print flex flex-wrap items-end gap-2">
          <div><label className="label">ตั้งแต่</label><input type="date" name="from" defaultValue={from} className="input py-1.5" /></div>
          <div><label className="label">ถึง</label><input type="date" name="to" defaultValue={to} className="input py-1.5" /></div>
          <button className="btn">ดู</button>
          <a className="btn" href={`/admin/reports/export?${qs}&type=summary`}>Excel สรุป</a>
          <a className="btn" href={`/admin/reports/export?${qs}&type=detail`}>Excel รายวัน</a>
        </form>
      </div>

      <section className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">สรุปรายคน</h2>
          <p className="text-xs text-muted">วันทำงานนับถึงวันนี้ ไม่รวมวันหยุดบริษัทและวันที่ไม่ใช่วันทำงาน · ขาด = วันทำงานที่ไม่ได้ลงเวลา (ยังไม่หักวันลา)</p>
        </div>
        <table className="table">
          <thead>
            <tr><th>รหัส</th><th>ชื่อ</th><th>ฝ่าย</th><th className="text-right">วันทำงาน</th><th className="text-right">มา</th><th className="text-right">ขาด/ไม่ลงเวลา</th><th className="text-right">สาย (วัน)</th><th className="text-right">สายรวม (นาที)</th><th className="text-right">กลับก่อน (วัน)</th><th className="text-right">กลับก่อนรวม (นาที)</th><th className="text-right">ไม่ลงเวลาออก</th></tr>
          </thead>
          <tbody>
            {report.summary.map((s) => (
              <tr key={s.employee_id}>
                <td className="text-muted tabular-nums">{s.emp_code}</td>
                <td className="whitespace-nowrap">{s.name}</td>
                <td className="text-muted">{s.work_group}</td>
                <td className="text-right tabular-nums">{s.workdays}</td>
                <td className="text-right tabular-nums">{s.present}</td>
                <td className={`text-right tabular-nums ${s.absent ? "font-medium text-bad" : ""}`}>{s.absent}</td>
                <td className={`text-right tabular-nums ${s.late_days ? "text-warn" : ""}`}>{s.late_days}</td>
                <td className="text-right tabular-nums">{s.late_minutes}</td>
                <td className={`text-right tabular-nums ${s.early_days ? "text-early" : ""}`}>{s.early_days}</td>
                <td className="text-right tabular-nums">{s.early_minutes}</td>
                <td className={`text-right tabular-nums ${s.missing_checkout ? "text-warn" : ""}`}>{s.missing_checkout}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="no-print">
        <EditAttendanceForm
          defaultDate={today}
          employees={employees.filter((e) => e.active && e.track_attendance).map((e) => ({ id: e.id, label: `${e.emp_code} · ${fullName(e)}` }))}
        />
      </div>

      <details className="card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">รายการลงเวลาทั้งหมด ({report.rows.length})</summary>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>วันที่</th><th>รหัส</th><th>ชื่อ</th><th>เข้า</th><th>ออก</th><th>สาย</th><th>กลับก่อน</th><th>ระยะจากบริษัท</th><th>หมายเหตุ HR</th></tr></thead>
            <tbody>
              {report.rows.map(({ employee: e, attendance: a }) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{fmtDate(a.work_date, { weekday: "short" })}</td>
                  <td className="text-muted tabular-nums">{e.emp_code}</td>
                  <td className="whitespace-nowrap">{fullName(e)}</td>
                  <td className="tabular-nums">{fmtTime(a.check_in_at)}</td>
                  <td className="tabular-nums">{fmtTime(a.check_out_at)}</td>
                  <td className="tabular-nums text-warn">{a.late_minutes ? `${a.late_minutes} น.` : ""}</td>
                  <td className="tabular-nums text-early">{a.early_minutes ? `${a.early_minutes} น.` : ""}</td>
                  <td className="tabular-nums text-muted">{a.check_in_distance_m != null ? `${Math.round(a.check_in_distance_m)} ม.` : "-"}</td>
                  <td className="text-xs text-muted">{a.admin_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
