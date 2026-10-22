import Link from "next/link";
import { requireMe } from "@/lib/session";
import { fmtDate, fmtDateLong, fmtTime, fullName, WEEKDAYS_LONG } from "@/lib/format";
import { CheckInPanel } from "./check-in-panel";
import { HolidayBadge } from "@/components/holiday-badge";

export default async function HomePage() {
  const me = await requireMe();
  const { employee: e, today, settings } = me;
  const offHoliday = today.holidays.find((h) => h.company_off);
  const publicWorking = today.holidays.filter((h) => !h.company_off);
  const isoDow = ((new Date(today.date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">{fmtDateLong(today.date)}</p>
        <h1 className="h1 mt-0.5">สวัสดี {e.nickname || e.first_name}</h1>
        <p className="text-xs text-muted">{fullName(e, false)} · {e.emp_code}{e.work_group ? ` · ${e.work_group}` : ""}</p>
      </div>

      {offHoliday && (
        <div className="rounded-xl border border-public/20 bg-bad-soft px-4 py-3 text-sm">
          <p className="font-medium text-public">วันนี้วันหยุด: {offHoliday.name}</p>
          <p className="text-xs text-muted">ถ้ามาทำงาน (OT) ยังลงเวลาได้ตามปกติ</p>
        </div>
      )}
      {!offHoliday && publicWorking.length > 0 && (
        <div className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <p className="font-medium">{publicWorking.map((h) => h.name).join(", ")}</p>
          <p className="text-xs text-muted">วันหยุดราชการ — บริษัทเปิดทำงานตามปกติ</p>
        </div>
      )}
      {!offHoliday && !today.is_workday && (
        <div className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <p className="font-medium">วัน{WEEKDAYS_LONG[isoDow - 1]} — ไม่ใช่วันทำงานปกติ</p>
          <p className="text-xs text-muted">ถ้ามาทำงาน (OT) ยังลงเวลาได้ตามปกติ</p>
        </div>
      )}

      <CheckInPanel
        serverTime={me.server_time}
        initial={today.attendance}
        workStart={settings.work_start}
        requireLocation={settings.require_location}
        tracked={e.track_attendance}
      />

      {me.upcoming_holidays.length > 0 && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">วันหยุดที่จะถึง</h2>
            <Link href="/calendar" className="text-xs text-accent">ดูปฏิทิน →</Link>
          </div>
          <ul className="divide-y divide-line/70">
            {me.upcoming_holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p>{h.name}</p>
                  <p className="text-xs text-muted">{fmtDate(h.holiday_date, { weekday: "short" })}</p>
                </div>
                <HolidayBadge h={h} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {me.recent.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">ประวัติ 14 วันล่าสุด</h2>
          <table className="table">
            <thead>
              <tr><th>วันที่</th><th>เข้า</th><th>ออก</th><th></th></tr>
            </thead>
            <tbody>
              {me.recent.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDate(a.work_date, { weekday: "short", year: undefined })}</td>
                  <td className="tabular-nums">{fmtTime(a.check_in_at)}</td>
                  <td className="tabular-nums">{fmtTime(a.check_out_at)}</td>
                  <td className="text-right">{a.late_minutes > 0 && <span className="badge bg-warn-soft text-warn">สาย {a.late_minutes} น.</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
