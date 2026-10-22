import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { rpc } from "@/lib/db";
import { addDays, fmtDateLong, fmtTime, fullName } from "@/lib/format";
import type { Attendance, Employee, Holiday, Settings } from "@/lib/types";
import { HolidayBadge } from "@/components/holiday-badge";
import { StatusBadges } from "@/components/status-badges";

type Dashboard = {
  date: string;
  today: string;
  is_workday: boolean;
  settings: Settings;
  holidays: Holiday[];
  rows: { employee: Employee; attendance: Attendance | null }[];
};

const FILTERS = [
  ["all", "ทั้งหมด"],
  ["late", "มาสาย"],
  ["early", "กลับก่อน"],
  ["missing", "ยังไม่/ไม่ได้ลงเวลา"],
] as const;

export default async function AdminDaily({ searchParams }: PageProps<"/admin">) {
  const { token } = await requireAdmin();
  const sp = await searchParams;
  const d = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : null;
  const filter = FILTERS.some(([k]) => k === sp.f) ? (sp.f as string) : "all";
  const data = await rpc<Dashboard>("hr_admin_dashboard", { p_token: token, p_date: d });

  const isToday = data.date === data.today;
  const isPast = data.date < data.today;
  const present = data.rows.filter((r) => r.attendance?.check_in_at);
  const late = present.filter((r) => (r.attendance?.late_minutes ?? 0) > 0);
  const early = present.filter((r) => (r.attendance?.early_minutes ?? 0) > 0);
  const missing = data.rows.filter((r) => !r.attendance?.check_in_at);
  const shown =
    filter === "late" ? late : filter === "early" ? early : filter === "missing" ? missing : data.rows;

  const groups = new Map<string, typeof shown>();
  for (const r of shown) {
    const g = r.employee.work_group || "ไม่ระบุฝ่าย";
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const q = (f: string) => `/admin?${new URLSearchParams({ ...(d ? { d } : {}), ...(f !== "all" ? { f } : {}) })}`;

  const stat = (label: string, value: number, tone: string, f: string) => (
    <Link href={q(f)} className={`card block px-4 py-3 transition hover:border-ink/40 ${filter === f ? "ring-2 ring-ink" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${value ? tone : ""}`}>{value}</p>
    </Link>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">รายงานรายวัน</p>
          <h1 className="h1">{fmtDateLong(data.date)}</h1>
          <p className="text-xs text-muted">
            เวลาทำงาน {data.settings.work_start}–{data.settings.work_end} น. · สายเมื่อเข้าหลัง {data.settings.work_start} เกิน {data.settings.late_grace_minutes} นาที · ออกก่อน {data.settings.work_end} = กลับก่อน
          </p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
          <Link className="btn btn-sm" href={`/admin?d=${addDays(data.date, -1)}`}>← วันก่อน</Link>
          <form className="flex gap-2">
            <input type="date" name="d" defaultValue={data.date} max={data.today} className="input py-1 text-sm" />
            <button className="btn btn-sm">ดู</button>
          </form>
          {!isToday && <Link className="btn btn-sm" href={`/admin?d=${addDays(data.date, 1)}`}>วันถัดไป →</Link>}
          {!isToday && <Link className="btn btn-sm" href="/admin">วันนี้</Link>}
          <a className="btn btn-sm" href={`/admin/reports/export?type=daily&date=${data.date}`}>ดาวน์โหลด Excel</a>
        </div>
      </div>

      {data.holidays.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.holidays.map((h) => (
            <div key={h.id} className="card flex items-center gap-2 px-3 py-2 text-sm">{h.name} <HolidayBadge h={h} /></div>
          ))}
        </div>
      )}
      {!data.is_workday && <p className="text-sm text-muted">วันนี้ไม่ใช่วันทำงาน — คนที่ลงเวลาถือเป็นการมาทำงานนอกเวลา ไม่นับสาย/กลับก่อน</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stat("พนักงานทั้งหมด", data.rows.length, "", "all")}
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">มาทำงาน</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ok">{present.length}</p>
        </div>
        {stat("มาสาย", late.length, "text-warn", "late")}
        {stat("กลับก่อนเวลา", early.length, "text-early", "early")}
        {stat(isPast ? "ขาด / ไม่ลงเวลา" : "ยังไม่ลงเวลา", data.is_workday ? missing.length : 0, "text-bad", "missing")}
      </div>

      {data.rows.length === 0 ? (
        <div className="card p-6 text-sm">
          ยังไม่มีพนักงานในระบบ — <Link className="text-accent underline" href="/admin/employees">นำเข้ารายชื่อจาก Excel</Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="card p-6 text-sm text-muted">ไม่มีรายการในตัวกรองนี้</div>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([g, rows]) => (
            <section key={g} className="card overflow-x-auto">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h2 className="text-sm font-semibold">{g}</h2>
                <span className="text-xs text-muted">{rows.length} คน</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>รหัส</th><th>ชื่อ</th><th>ตำแหน่ง</th><th>เข้า</th><th>ออก</th>
                    <th className="text-right">สาย (นาที)</th><th className="text-right">กลับก่อน (นาที)</th><th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ employee: e, attendance: a }) => (
                    <tr key={e.id}>
                      <td className="text-muted tabular-nums">{e.emp_code}</td>
                      <td className="whitespace-nowrap">{fullName(e)}</td>
                      <td className="text-muted">{e.position ?? "-"}</td>
                      <td className={`tabular-nums ${a && a.late_minutes > 0 ? "font-medium text-warn" : ""}`}>{fmtTime(a?.check_in_at)}</td>
                      <td className={`tabular-nums ${a && a.early_minutes > 0 ? "font-medium text-early" : ""}`}>{fmtTime(a?.check_out_at)}</td>
                      <td className="text-right tabular-nums">{a?.late_minutes || ""}</td>
                      <td className="text-right tabular-nums">{a?.early_minutes || ""}</td>
                      <td><StatusBadges a={a} isWorkday={data.is_workday} isPast={isPast} isToday={isToday} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
