"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthed } from "@/lib/use-authed";
import { addDays, fmtDateLong, fmtTime, fullName } from "@/lib/format";
import { dailyLines, downloadCsv } from "@/lib/export";
import type { Attendance, Employee, Holiday, Settings } from "@/lib/types";
import { HolidayBadge } from "@/components/holiday-badge";
import { StatusBadges } from "@/components/status-badges";
import { PhotoThumb } from "@/components/photo-thumb";
import { PhotoStatusBanner } from "@/components/photo-status-banner";
import { Loading } from "@/components/session";
import { STAMPS, type StampKind } from "@/lib/stamps";

type Dashboard = {
  date: string;
  today: string;
  is_workday: boolean;
  settings: Settings;
  holidays: Holiday[];
  rows: { employee: Employee; attendance: Attendance | null }[];
};
type Photo = { employee_id: string; kind: StampKind; image: string; taken_at: string };

const FILTERS = [
  ["all", "ทั้งหมด"],
  ["late", "มาสาย"],
  ["break_late", "กลับจากพักสาย"],
  ["early", "กลับก่อน"],
  ["missing", "ยังไม่/ไม่ได้ลงเวลา"],
] as const;

function Daily() {
  const sp = useSearchParams();
  const d = sp.get("d") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("d")!) ? sp.get("d") : null;
  const filter = FILTERS.some(([k]) => k === sp.get("f")) ? sp.get("f")! : "all";
  const dash = useAuthed<Dashboard>("hr_admin_dashboard", { p_date: d });
  const date = dash.data?.date;
  const photos = useAuthed<Photo[]>("hr_admin_photos", { p_date: date ?? "" }, !!date);

  if (!dash.data) return <Loading error={dash.error} />;
  const data = dash.data;
  const photoMap = new Map((photos.data ?? []).map((p) => [`${p.employee_id}|${p.kind}`, p.image]));

  const isToday = data.date === data.today;
  const isPast = data.date < data.today;
  const present = data.rows.filter((r) => r.attendance?.check_in_at);
  const late = present.filter((r) => (r.attendance?.late_minutes ?? 0) > 0);
  const early = present.filter((r) => (r.attendance?.early_minutes ?? 0) > 0);
  const breakLate = present.filter((r) => (r.attendance?.break_late_minutes ?? 0) > 0);
  const missing = data.rows.filter((r) => !r.attendance?.check_in_at);
  const shown =
    filter === "late" ? late : filter === "early" ? early : filter === "break_late" ? breakLate : filter === "missing" ? missing : data.rows;

  const groups = new Map<string, typeof shown>();
  for (const r of shown) {
    const g = r.employee.work_group || "ไม่ระบุฝ่าย";
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const q = (f: string) => `/admin/?${new URLSearchParams({ ...(d ? { d } : {}), ...(f !== "all" ? { f } : {}) })}`;

  const stat = (label: string, value: number, tone: string, f: string) => (
    <Link href={q(f)} className={`card block px-4 py-3 transition hover:border-ink/40 ${filter === f ? "ring-2 ring-ink" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${value ? tone : ""}`}>{value}</p>
    </Link>
  );

  return (
    <div className="space-y-5">
      <PhotoStatusBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">รายงานรายวัน</p>
          <h1 className="h1">{fmtDateLong(data.date)}</h1>
          <p className="text-xs text-muted">
            เข้า {data.settings.work_start} · พัก {data.settings.break_start}–{data.settings.break_end} · เลิก {data.settings.work_end} น. · สายเมื่อเกินเวลา {data.settings.late_grace_minutes} นาที · ออกก่อนเวลา = กลับก่อน
          </p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
          <Link className="btn btn-sm" href={`/admin/?d=${addDays(data.date, -1)}`}>← วันก่อน</Link>
          <form className="flex gap-2" action="">
            <input type="date" name="d" defaultValue={data.date} max={data.today} className="input py-1 text-sm" />
            <button className="btn btn-sm">ดู</button>
          </form>
          {!isToday && <Link className="btn btn-sm" href={`/admin/?d=${addDays(data.date, 1)}`}>วันถัดไป →</Link>}
          {!isToday && <Link className="btn btn-sm" href="/admin/">วันนี้</Link>}
          <button className="btn btn-sm" onClick={() => downloadCsv(`daily-${data.date}`, dailyLines(data.date, data.today, data.is_workday, data.rows))}>
            ดาวน์โหลด Excel
          </button>
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {stat("พนักงานทั้งหมด", data.rows.length, "", "all")}
        <div className="card px-4 py-3">
          <p className="text-xs text-muted">มาทำงาน</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ok">{present.length}</p>
        </div>
        {stat("มาสาย", late.length, "text-warn", "late")}
        {stat("กลับจากพักสาย", breakLate.length, "text-warn", "break_late")}
        {stat("กลับก่อนเวลา", early.length, "text-early", "early")}
        {stat(isPast ? "ขาด / ไม่ลงเวลา" : "ยังไม่ลงเวลา", data.is_workday ? missing.length : 0, "text-bad", "missing")}
      </div>

      {data.rows.length === 0 ? (
        <div className="card p-6 text-sm">
          ยังไม่มีพนักงานในระบบ — <Link className="text-accent underline" href="/admin/employees/">นำเข้ารายชื่อจาก Excel</Link>
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
                    <th>รหัส</th><th>ชื่อ</th>
                    {STAMPS.map((st) => <th key={st.kind}>{st.label}</th>)}
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ employee: e, attendance: a }) => (
                    <tr key={e.id}>
                      <td className="text-muted tabular-nums">{e.emp_code}</td>
                      <td className="whitespace-nowrap">{fullName(e)}<span className="block text-xs text-muted">{e.position ?? ""}</span></td>
                      {STAMPS.map((st) => {
                        const at = a?.[st.field] ?? null;
                        const flagged =
                          !!a &&
                          ((st.kind === "in" && a.late_minutes > 0) ||
                            (st.kind === "break_out" && a.break_early_minutes > 0) ||
                            (st.kind === "break_in" && a.break_late_minutes > 0) ||
                            (st.kind === "out" && a.early_minutes > 0));
                        const tone = st.kind === "in" || st.kind === "break_in" ? "text-warn" : "text-early";
                        return (
                          <td key={st.kind} className="whitespace-nowrap">
                            {at ? (
                              <span className="inline-flex items-center gap-2">
                                <PhotoThumb src={photoMap.get(`${e.id}|${st.kind}`)} label={`${fullName(e, false)} · ${st.label} ${fmtTime(at)}`} />
                                <span className={`tabular-nums ${flagged ? `font-medium ${tone}` : ""}`}>{fmtTime(at)}</span>
                              </span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                        );
                      })}
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

export default function AdminDailyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Daily />
    </Suspense>
  );
}
