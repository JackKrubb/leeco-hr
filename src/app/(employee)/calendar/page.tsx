import Link from "next/link";
import { getToken, requireMe } from "@/lib/session";
import { rpc } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import type { Attendance, Holiday } from "@/lib/types";
import { CalendarLegend, MonthGrid } from "@/components/month-grid";
import { HolidayBadge } from "@/components/holiday-badge";

type CalendarData = { today: string; work_days: number[]; holidays: Holiday[]; attendance: Attendance[] };

function parseMonth(m: string | undefined, today: string) {
  const match = m?.match(/^(\d{4})-(\d{2})$/);
  const [y, mo] = match ? [+match[1], +match[2]] : [+today.slice(0, 4), +today.slice(5, 7)];
  return { y, mo: Math.min(12, Math.max(1, mo)) };
}

const shift = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const me = await requireMe();
  const sp = await searchParams;
  const { y, mo } = parseMonth(typeof sp.m === "string" ? sp.m : undefined, me.today.date);
  const data = await rpc<CalendarData>("hr_calendar", { p_token: await getToken(), p_from: `${y}-01-01`, p_to: `${y}-12-31` });
  const monthKey = `${y}-${String(mo).padStart(2, "0")}`;
  const monthHolidays = data.holidays.filter((h) => h.holiday_date.startsWith(monthKey));
  const yearOff = data.holidays.filter((h) => h.company_off);
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, mo - 1, 15)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/calendar?m=${shift(y, mo, -1)}`} className="btn btn-sm" aria-label="เดือนก่อน">←</Link>
        <h1 className="h1">{monthLabel}</h1>
        <Link href={`/calendar?m=${shift(y, mo, 1)}`} className="btn btn-sm" aria-label="เดือนถัดไป">→</Link>
      </div>

      <MonthGrid year={y} month={mo} today={data.today} workDays={data.work_days} holidays={data.holidays} attendance={data.attendance} />
      <CalendarLegend showAttendance />

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">วันหยุดเดือนนี้</h2>
        {monthHolidays.length === 0 ? (
          <p className="text-sm text-muted">ไม่มีวันหยุดพิเศษในเดือนนี้</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {monthHolidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p>{h.name}</p>
                  <p className="text-xs text-muted">{fmtDate(h.holiday_date, { weekday: "long" })}{h.note ? ` · ${h.note}` : ""}</p>
                </div>
                <HolidayBadge h={h} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">วันหยุดบริษัททั้งปี {y + 543} ({yearOff.length} วัน)</summary>
        <ul className="mt-2 divide-y divide-line/70">
          {yearOff.map((h) => (
            <li key={h.id} className="flex justify-between gap-3 py-1.5 text-sm">
              <span>{h.name}</span>
              <span className="text-muted tabular-nums">{fmtDate(h.holiday_date, { weekday: "short" })}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
