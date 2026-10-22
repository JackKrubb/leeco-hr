"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { messageOf, rpc } from "@/lib/api";
import { getKioskKey } from "@/lib/kiosk";
import { useClientValue } from "@/lib/use-client-value";
import { bkkToday, fmtDate } from "@/lib/format";
import { parseMonthParam, shiftMonth, thaiMonth } from "@/lib/calendar";
import type { Holiday } from "@/lib/types";
import { Brand } from "@/components/brand";
import { CalendarLegend, MonthGrid } from "@/components/month-grid";
import { HolidayBadge } from "@/components/holiday-badge";

type CalendarData = { today: string; work_days: number[]; holidays: Holiday[] };

function CalendarInner() {
  const sp = useSearchParams();
  const { y, mo, key } = parseMonthParam(sp.get("m"), bkkToday());
  const k = useClientValue(getKioskKey);
  const [data, setData] = useState<CalendarData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!k) return;
    rpc<CalendarData>("hr_kiosk_calendar", { p_key: k, p_from: `${y}-01-01`, p_to: `${y}-12-31` })
      .then(setData)
      .catch((e) => setFetchError(messageOf(e)));
  }, [k, y]);
  const error = k === null ? "อุปกรณ์นี้ยังไม่ได้เปิดใช้ — เปิดลิงก์ลงเวลาที่ได้จาก HR" : fetchError;

  const monthHolidays = data?.holidays.filter((h) => h.holiday_date.startsWith(key)) ?? [];
  const yearOff = data?.holidays.filter((h) => h.company_off) ?? [];

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-5 pb-12">
      <header className="flex items-center justify-between">
        <Brand sub="ปฏิทินวันหยุด" />
        <Link href="/" className="btn btn-sm">← ลงเวลา</Link>
      </header>
      <div className="flex items-center justify-between">
        <Link href={`/calendar/?m=${shiftMonth(y, mo, -1)}`} className="btn btn-sm" aria-label="เดือนก่อน">←</Link>
        <h1 className="h1">{thaiMonth(y, mo)}</h1>
        <Link href={`/calendar/?m=${shiftMonth(y, mo, 1)}`} className="btn btn-sm" aria-label="เดือนถัดไป">→</Link>
      </div>
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      {data && (
        <>
          <MonthGrid year={y} month={mo} today={data.today} workDays={data.work_days} holidays={data.holidays} />
          <CalendarLegend />
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
                      <p className="text-xs text-muted">{fmtDate(h.holiday_date, { weekday: "long" })}</p>
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
        </>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarInner />
    </Suspense>
  );
}
