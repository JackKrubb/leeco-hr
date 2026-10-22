"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthed } from "@/lib/use-authed";
import { Loading } from "@/components/session";
import { bkkToday, fmtDate } from "@/lib/format";
import type { Holiday } from "@/lib/types";
import { HolidayBadge } from "@/components/holiday-badge";
import { deleteHoliday } from "@/lib/actions/admin";
import { HolidayImportPanel } from "./import-panel";
import { HolidayForm } from "./holiday-form";

function Holidays() {
  const y = useSearchParams().get("y");
  const thisYear = Number(bkkToday().slice(0, 4));
  const year = y && /^\d{4}$/.test(y) ? Number(y) : thisYear;
  const q = useAuthed<Holiday[]>("hr_admin_holidays", { p_year: year });
  if (!q.data) return <Loading error={q.error} />;
  const holidays = q.data;
  const offCount = holidays.filter((h) => h.company_off).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">ปฏิทินวันหยุด</p>
          <h1 className="h1">ปี {year + 543} <span className="text-base font-normal text-muted">({year})</span></h1>
          <p className="text-xs text-muted">บริษัทหยุด {offCount} วัน · ทั้งหมด {holidays.length} รายการ</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-sm" href={`/admin/holidays/?y=${year - 1}`}>← {year - 1 + 543}</Link>
          <Link className="btn btn-sm" href={`/admin/holidays/?y=${year + 1}`}>{year + 1 + 543} →</Link>
        </div>
      </div>

      <HolidayImportPanel />

      <section className="card overflow-x-auto">
        {holidays.length === 0 ? (
          <p className="p-6 text-sm text-muted">ยังไม่มีวันหยุดของปีนี้ — อัปโหลดไฟล์ Excel หรือเพิ่มทีละวันด้านล่าง</p>
        ) : (
          <table className="table">
            <thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th>ประเภท</th><th>หมายเหตุ</th><th></th></tr></thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{fmtDate(h.holiday_date, { weekday: "short" })}</td>
                  <td>{h.name}</td>
                  <td><HolidayBadge h={h} /></td>
                  <td className="text-xs text-muted">{h.note}</td>
                  <td className="text-right">
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      if (!confirm(`ลบวันหยุด “${h.name}”?`)) return;
                      const res = await deleteHoliday(h.id);
                      if (!res.ok) alert(res.error);
                    }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <HolidayForm />
    </div>
  );
}

export default function HolidaysPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Holidays />
    </Suspense>
  );
}
