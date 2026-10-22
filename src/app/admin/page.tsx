import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { rpc } from "@/lib/db";
import { addDays, fmtDateLong, fmtTime, fullName } from "@/lib/format";
import type { Attendance, Employee, Holiday, Settings } from "@/lib/types";
import { HolidayBadge } from "@/components/holiday-badge";

type Dashboard = {
  date: string;
  today: string;
  is_workday: boolean;
  settings: Settings;
  holidays: Holiday[];
  rows: { employee: Employee; attendance: Attendance | null }[];
};

export default async function AdminToday({ searchParams }: PageProps<"/admin">) {
  const { token } = await requireAdmin();
  const sp = await searchParams;
  const d = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : null;
  const data = await rpc<Dashboard>("hr_admin_dashboard", { p_token: token, p_date: d });

  const present = data.rows.filter((r) => r.attendance?.check_in_at);
  const late = present.filter((r) => (r.attendance?.late_minutes ?? 0) > 0);
  const missing = data.rows.filter((r) => !r.attendance?.check_in_at);
  const out = present.filter((r) => r.attendance?.check_out_at);
  const isPast = data.date < data.today;

  const groups = new Map<string, typeof data.rows>();
  for (const r of data.rows) {
    const g = r.employee.work_group || "ไม่ระบุฝ่าย";
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }

  const stat = (label: string, value: number, tone = "") => (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">ภาพรวมการลงเวลา</p>
          <h1 className="h1">{fmtDateLong(data.date)}</h1>
          <p className="text-xs text-muted">เวลาเข้างาน {data.settings.work_start} น. · ผ่อนผัน {data.settings.late_grace_minutes} นาที</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-sm" href={`/admin?d=${addDays(data.date, -1)}`}>← วันก่อน</Link>
          {data.date !== data.today && <Link className="btn btn-sm" href="/admin">วันนี้</Link>}
          {data.date < data.today && <Link className="btn btn-sm" href={`/admin?d=${addDays(data.date, 1)}`}>วันถัดไป →</Link>}
        </div>
      </div>

      {data.holidays.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.holidays.map((h) => (
            <div key={h.id} className="card flex items-center gap-2 px-3 py-2 text-sm">{h.name} <HolidayBadge h={h} /></div>
          ))}
        </div>
      )}
      {!data.is_workday && <p className="text-sm text-muted">วันนี้ไม่ใช่วันทำงาน — คนที่ลงเวลาถือเป็นการมาทำงานนอกเวลา</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("พนักงานทั้งหมด", data.rows.length)}
        {stat("ลงเวลาเข้าแล้ว", present.length, "text-ok")}
        {stat("มาสาย", late.length, late.length ? "text-warn" : "")}
        {stat(isPast ? "ไม่ได้ลงเวลา" : "ยังไม่ลงเวลา", missing.length, missing.length && data.is_workday ? "text-bad" : "")}
      </div>

      {data.rows.length === 0 ? (
        <div className="card p-6 text-sm">
          ยังไม่มีพนักงานในระบบ — <Link className="text-accent underline" href="/admin/employees">นำเข้ารายชื่อจาก Excel</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([g, rows]) => (
            <section key={g} className="card overflow-x-auto">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h2 className="text-sm font-semibold">{g}</h2>
                <span className="text-xs text-muted">{rows.filter((r) => r.attendance?.check_in_at).length}/{rows.length} คน</span>
              </div>
              <table className="table">
                <thead>
                  <tr><th>รหัส</th><th>ชื่อ</th><th>ตำแหน่ง</th><th>เข้า</th><th>ออก</th><th>สถานะ</th></tr>
                </thead>
                <tbody>
                  {rows.map(({ employee: e, attendance: a }) => (
                    <tr key={e.id}>
                      <td className="text-muted tabular-nums">{e.emp_code}</td>
                      <td className="whitespace-nowrap">{fullName(e)}</td>
                      <td className="text-muted">{e.position ?? "-"}</td>
                      <td className="tabular-nums">{fmtTime(a?.check_in_at)}</td>
                      <td className="tabular-nums">{fmtTime(a?.check_out_at)}</td>
                      <td>
                        {!a?.check_in_at ? (
                          <span className={`badge ${data.is_workday ? "bg-bad-soft text-bad" : "bg-paper text-muted"}`}>{isPast ? "ไม่ได้ลงเวลา" : "ยังไม่เข้า"}</span>
                        ) : a.late_minutes > 0 ? (
                          <span className="badge bg-warn-soft text-warn">สาย {a.late_minutes} น.</span>
                        ) : (
                          <span className="badge bg-ok-soft text-ok">ตรงเวลา</span>
                        )}
                        {a?.admin_note && <span className="ml-1 badge bg-paper text-muted" title={a.admin_note}>แก้ไขโดย HR</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          <p className="text-xs text-muted">ลงเวลาออกแล้ว {out.length} คน</p>
        </div>
      )}
    </div>
  );
}
