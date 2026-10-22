"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthed } from "@/lib/use-authed";
import { reviewMonth } from "@/lib/actions/admin";
import { detailLines, downloadCsv, summaryLines } from "@/lib/export";
import { bkkToday, fmtDate, fmtTime, WEEKDAYS_SHORT } from "@/lib/format";
import { Loading } from "@/components/session";
import type { PhotoMonth } from "@/components/photo-status-banner";
import { isoDow, monthDays, parseMonthParam, shiftMonth, thaiMonth, workdayChecker } from "@/lib/calendar";
import type { AttendanceReport } from "@/lib/attendance-report";
import type { Attendance, Employee, Holiday, Settings } from "@/lib/types";

const SORTS = { order: "ลำดับ", late: "สายมากสุด", early: "กลับก่อนมากสุด", absent: "ขาดมากสุด" } as const;
type SortKey = keyof typeof SORTS;

function ReviewPanel({ monthKey, status }: { monthKey: string; status?: PhotoMonth }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!status) return null;
  const toggle = async (reviewed: boolean) => {
    if (reviewed && !confirm("ยืนยันว่าตรวจรีพอร์ตของเดือนนี้เสร็จแล้ว?\nหลังยืนยัน รูปลงเวลาของเดือนนี้ที่อายุเกิน 30 วันจะถูกลบอัตโนมัติ")) return;
    setBusy(true);
    const res = await reviewMonth(`${monthKey}-01`, reviewed);
    setBusy(false);
    setMsg(res.ok ? (reviewed ? `ยืนยันแล้ว${res.data!.purged ? ` · ลบรูปเก่าไป ${res.data!.purged} รูป` : ""}` : "ยกเลิกการยืนยันแล้ว") : res.error);
  };
  const mb = (status.bytes / 1024 / 1024).toFixed(1);
  return (
    <section className={`card flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${status.reviewed ? "" : status.ended ? "border-warn/40 bg-warn-soft/40" : ""}`}>
      <div className="text-sm">
        <p className="font-semibold">
          การตรวจรีพอร์ต:{" "}
          {status.reviewed ? <span className="text-ok">ตรวจแล้ว</span> : status.ended ? <span className="text-warn">ยังไม่ได้ตรวจ</span> : <span className="text-muted">ยังไม่จบเดือน</span>}
        </p>
        <p className="text-xs text-muted">
          รูปลงเวลาเดือนนี้ {status.photos} รูป ({mb} MB) ·{" "}
          {status.reviewed
            ? `ยืนยันโดย ${status.reviewed_by ?? "-"} เมื่อ ${fmtDate(status.reviewed_at)} · รูปที่อายุเกิน 30 วันจะถูกลบอัตโนมัติ (หมดภายใน ${fmtDate(status.all_deleted_by)})`
            : "รูปจะยังไม่ถูกลบจนกว่า HR จะยืนยันว่าตรวจรีพอร์ตเดือนนี้เสร็จ"}
        </p>
        {msg && <p className="mt-1 text-xs">{msg}</p>}
      </div>
      {status.ended && (
        status.reviewed ? (
          <button className="btn btn-sm" disabled={busy} onClick={() => toggle(false)}>ยกเลิกการยืนยัน</button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => toggle(true)}>ยืนยันว่าตรวจรีพอร์ตเดือนนี้แล้ว</button>
        )
      )}
    </section>
  );
}

function MonthlyReport() {
  const sp = useSearchParams();
  const today = bkkToday();
  const { y, mo, key, from, to } = parseMonthParam(sp.get("m") ?? undefined, today);
  const sortParam = sp.get("sort") ?? "";
  const sort: SortKey = sortParam in SORTS ? (sortParam as SortKey) : "order";

  const reportQ = useAuthed<AttendanceReport>("hr_admin_attendance", { p_from: from, p_to: to });
  const holidaysQ = useAuthed<Holiday[]>("hr_admin_holidays", { p_year: y });
  const settingsQ = useAuthed<Settings>("hr_admin_settings");
  const employeesQ = useAuthed<Employee[]>("hr_admin_employees");
  const photoQ = useAuthed<PhotoMonth[]>("hr_admin_photo_status");
  const report = reportQ.data, holidays = holidaysQ.data, settings = settingsQ.data, employees = employeesQ.data;
  if (!report || !holidays || !settings || !employees) {
    return <Loading error={reportQ.error ?? holidaysQ.error ?? settingsQ.error ?? employeesQ.error} />;
  }
  const status = photoQ.data?.find((m) => m.month.startsWith(key)) ?? (photoQ.data ? { month: `${key}-01`, photos: 0, bytes: 0, ended: key < today.slice(0, 7), reviewed: false, reviewed_at: null, reviewed_by: null, all_deleted_by: null } : undefined);

  const days = monthDays(y, mo);
  const isWorkday = workdayChecker(settings.work_days, holidays);
  const holidayByDate = new Map(holidays.map((h) => [h.holiday_date, h]));
  const companyWorkdays = days.filter((d) => isWorkday(d)).length;
  const empById = new Map(employees.map((e) => [e.id, e]));
  const att = new Map<string, Attendance>();
  for (const r of report.rows) att.set(`${r.attendance.employee_id}|${r.attendance.work_date}`, r.attendance);

  const summary = [...report.summary].sort((a, b) =>
    sort === "late" ? b.late_minutes - a.late_minutes || b.late_days - a.late_days
    : sort === "early" ? b.early_minutes - a.early_minutes || b.early_days - a.early_days
    : sort === "absent" ? b.absent - a.absent
    : 0,
  );
  const tot = summary.reduce(
    (t, s) => ({ late: t.late + s.late_days, lateMin: t.lateMin + s.late_minutes, early: t.early + s.early_days, earlyMin: t.earlyMin + s.early_minutes, absent: t.absent + s.absent, miss: t.miss + s.missing_checkout }),
    { late: 0, lateMin: 0, early: 0, earlyMin: 0, absent: 0, miss: 0 },
  );
  const link = (p: Record<string, string>) => `/admin/reports/monthly/?${new URLSearchParams({ m: key, ...(sort !== "order" ? { sort } : {}), ...p })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">รายงานรายเดือน</p>
          <h1 className="h1">{thaiMonth(y, mo)}</h1>
          <p className="text-xs text-muted">วันทำงานของบริษัทเดือนนี้ {companyWorkdays} วัน · นับถึงวันนี้เท่านั้น · เวลาทำงาน {settings.work_start}–{settings.work_end} น.</p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
          <Link className="btn btn-sm" href={`/admin/reports/monthly/?m=${shiftMonth(y, mo, -1)}`}>← เดือนก่อน</Link>
          <form className="flex gap-2" action="">
            <input type="month" name="m" defaultValue={key} className="input py-1 text-sm" />
            <button className="btn btn-sm">ดู</button>
          </form>
          {key < today.slice(0, 7) && <Link className="btn btn-sm" href={`/admin/reports/monthly/?m=${shiftMonth(y, mo, 1)}`}>เดือนถัดไป →</Link>}
          <button className="btn btn-sm" onClick={() => downloadCsv(`monthly-${key}`, summaryLines(report))}>Excel สรุปเดือน</button>
          <button className="btn btn-sm" onClick={() => downloadCsv(`detail-${from}-to-${to}`, detailLines(report))}>Excel รายวันทั้งเดือน</button>
        </div>
      </div>

      <ReviewPanel monthKey={key} status={status} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["มาสาย", `${tot.late} ครั้ง`, `${tot.lateMin} นาที`, "text-warn"],
          ["กลับก่อนเวลา", `${tot.early} ครั้ง`, `${tot.earlyMin} นาที`, "text-early"],
          ["ขาด / ไม่ลงเวลา", `${tot.absent} วัน-คน`, "ยังไม่หักวันลา", "text-bad"],
          ["ไม่ลงเวลาออก", `${tot.miss} ครั้ง`, "", ""],
          ["พนักงาน", `${summary.length} คน`, "", ""],
        ].map(([label, v, sub, tone]) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{v}</p>
            {sub && <p className="text-xs text-muted">{sub}</p>}
          </div>
        ))}
      </div>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">สรุปรายคน</h2>
          <div className="no-print flex flex-wrap gap-1 text-xs">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <Link key={k} href={link({ sort: k })} className={`rounded-full px-2.5 py-1 ${sort === k ? "bg-ink text-white" : "border border-line text-muted hover:text-ink"}`}>{SORTS[k]}</Link>
            ))}
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>รหัส</th><th>ชื่อ</th><th>ฝ่าย</th>
              <th className="text-right">วันทำงาน</th><th className="text-right">มา</th><th className="text-right">ขาด</th>
              <th className="text-right">สาย (ครั้ง)</th><th className="text-right">สาย (นาที)</th>
              <th className="text-right">กลับก่อน (ครั้ง)</th><th className="text-right">กลับก่อน (นาที)</th>
              <th className="text-right">ไม่ลงเวลาออก</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.employee_id}>
                <td className="text-muted tabular-nums">{s.emp_code}</td>
                <td className="whitespace-nowrap">{s.name}</td>
                <td className="text-muted">{s.work_group}</td>
                <td className="text-right tabular-nums">{s.workdays}</td>
                <td className="text-right tabular-nums">{s.present}</td>
                <td className={`text-right tabular-nums ${s.absent ? "font-medium text-bad" : "text-muted"}`}>{s.absent}</td>
                <td className={`text-right tabular-nums ${s.late_days ? "font-medium text-warn" : "text-muted"}`}>{s.late_days}</td>
                <td className={`text-right tabular-nums ${s.late_minutes ? "text-warn" : "text-muted"}`}>{s.late_minutes}</td>
                <td className={`text-right tabular-nums ${s.early_days ? "font-medium text-early" : "text-muted"}`}>{s.early_days}</td>
                <td className={`text-right tabular-nums ${s.early_minutes ? "text-early" : "text-muted"}`}>{s.early_minutes}</td>
                <td className={`text-right tabular-nums ${s.missing_checkout ? "" : "text-muted"}`}>{s.missing_checkout}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">ตารางรายวันทั้งเดือน</h2>
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-ok-soft ring-1 ring-ok/30" />ปกติ</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-warn-soft ring-1 ring-warn/30" />สาย (นาที)</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-early-soft ring-1 ring-early/30" />กลับก่อน (นาที)</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-bad-soft ring-1 ring-bad/30" />ขาด</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-paper ring-1 ring-line" />วันหยุด</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-40 border-b border-line bg-card px-3 py-1.5 text-left font-medium text-muted">พนักงาน</th>
                {days.map((d) => {
                  const h = holidayByDate.get(d);
                  return (
                    <th key={d} title={h?.name} className={`border-b border-l border-line/60 px-0 py-1 text-center font-normal ${isWorkday(d) ? "text-muted" : "bg-paper text-public/80"} ${d === today ? "bg-ink! text-white!" : ""}`}>
                      <Link href={`/admin/?d=${d}`} className="block min-w-7">
                        <span className="block text-[10px]">{WEEKDAYS_SHORT[isoDow(d) - 1]}</span>
                        <span className="block tabular-nums">{+d.slice(8)}</span>
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => {
                const start = empById.get(s.employee_id)?.start_date ?? null;
                return (
                  <tr key={s.employee_id}>
                    <td className="sticky left-0 z-10 border-b border-line/60 bg-card px-3 py-1 whitespace-nowrap">
                      <span className="text-muted tabular-nums">{s.emp_code}</span> {s.name.replace(/^(นาย|นาง|น\.ส\.)/, "")}
                    </td>
                    {days.map((d) => {
                      const a = att.get(`${s.employee_id}|${d}`);
                      const work = isWorkday(d);
                      const future = d > today;
                      const notStarted = start !== null && d < start;
                      let cls = "";
                      let content: React.ReactNode = null;
                      let title = "";
                      if (a?.check_in_at) {
                        title = `เข้า ${fmtTime(a.check_in_at)} · ออก ${fmtTime(a.check_out_at)}${a.admin_note ? ` · HR: ${a.admin_note}` : ""}`;
                        if (a.late_minutes > 0 && a.early_minutes > 0) {
                          cls = "bg-warn-soft";
                          content = <><span className="block leading-none text-warn">{a.late_minutes}</span><span className="block leading-none text-early">{a.early_minutes}</span></>;
                        } else if (a.late_minutes > 0) {
                          cls = "bg-warn-soft text-warn font-medium";
                          content = a.late_minutes;
                        } else if (a.early_minutes > 0) {
                          cls = "bg-early-soft text-early font-medium";
                          content = a.early_minutes;
                        } else {
                          cls = work ? "bg-ok-soft text-ok" : "bg-ok-soft/60 text-ok";
                          content = a.check_out_at || d === today ? "✓" : "?";
                          if (!a.check_out_at && d !== today) title += " · ไม่ลงเวลาออก";
                        }
                      } else if (!work) {
                        cls = "bg-paper";
                      } else if (!future && !notStarted && d !== today) {
                        cls = "bg-bad-soft text-bad";
                        content = "ข";
                        title = "ขาด / ไม่ได้ลงเวลา";
                      }
                      return (
                        <td key={d} title={title} className={`h-7 min-w-7 border-b border-l border-line/60 text-center tabular-nums ${cls}`}>
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-muted">ตัวเลข = จำนวนนาทีที่สาย/กลับก่อน · ช่องที่มีสองตัวเลข = ทั้งสาย (บน) และกลับก่อน (ล่าง) · “?” = ไม่ลงเวลาออก · ชี้ที่ช่องเพื่อดูเวลาเข้า-ออก · คลิกวันที่เพื่อดูรายงานรายวัน</p>
      </section>
    </div>
  );
}

export default function MonthlyReportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MonthlyReport />
    </Suspense>
  );
}
