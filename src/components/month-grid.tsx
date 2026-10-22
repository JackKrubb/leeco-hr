import type { Attendance, Holiday } from "@/lib/types";
import { WEEKDAYS_SHORT } from "@/lib/format";

/** Monday-first month grid with holidays and (optionally) one person's attendance. */
export function MonthGrid({
  year,
  month, // 1-12
  today,
  workDays,
  holidays,
  attendance = [],
}: {
  year: number;
  month: number;
  today: string;
  workDays: number[];
  holidays: Holiday[];
  attendance?: Attendance[];
}) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const byDate = new Map<string, Holiday[]>();
  holidays.forEach((h) => byDate.set(h.holiday_date, [...(byDate.get(h.holiday_date) ?? []), h]));
  const attByDate = new Map(attendance.map((a) => [a.work_date, a]));

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-paper/60 text-center text-xs text-muted">
        {WEEKDAYS_SHORT.map((d, i) => (
          <div key={d} className={`py-2 ${workDays.includes(i + 1) ? "" : "text-public/80"}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="min-h-16 border-r border-b border-line/60 bg-paper/40 sm:min-h-20" />;
          const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dow = (i % 7) + 1;
          const hs = byDate.get(iso) ?? [];
          const off = hs.some((h) => h.company_off);
          const weekend = !workDays.includes(dow);
          const a = attByDate.get(iso);
          const isToday = iso === today;
          return (
            <div
              key={i}
              className={`relative min-h-16 border-r border-b border-line/60 p-1 sm:min-h-20 sm:p-1.5 ${
                off ? (hs.some((h) => h.company_off && h.type === "company") ? "bg-company-soft" : "bg-bad-soft") : weekend ? "bg-paper/70" : ""
              }`}
            >
              <span
                className={`inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                  isToday ? "bg-ink font-semibold text-white" : off || weekend ? "text-public" : ""
                }`}
              >
                {day}
              </span>
              {hs.map((h) => (
                <p
                  key={h.id}
                  title={h.name}
                  className={`mt-0.5 line-clamp-2 text-[10px] leading-tight sm:text-[11px] ${
                    !h.company_off ? "text-muted" : h.type === "company" ? "text-company" : "text-public"
                  }`}
                >
                  {h.name}
                </p>
              ))}
              {a?.check_in_at && (
                <span
                  title={a.late_minutes > 0 ? `สาย ${a.late_minutes} นาที` : "มาทำงาน"}
                  className={`absolute top-1.5 right-1.5 size-2 rounded-full ${a.late_minutes > 0 ? "bg-warn" : "bg-ok"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarLegend({ showAttendance }: { showAttendance?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-bad-soft ring-1 ring-public/20" />วันหยุดราชการ (บริษัทหยุด)</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-company-soft ring-1 ring-company/20" />วันหยุดบริษัท</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-paper ring-1 ring-line" />ไม่ใช่วันทำงาน</span>
      {showAttendance && (
        <>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" />มาทำงาน</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warn" />มาสาย</span>
        </>
      )}
    </div>
  );
}
