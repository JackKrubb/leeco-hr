"use client";

import { useRef, useState, useTransition } from "react";
import { commitHolidays, previewHolidays, type HolidayPreview } from "@/lib/actions/admin";
import { asset } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { IssuesList } from "@/components/issues-list";
import { HolidayBadge } from "@/components/holiday-badge";

export function HolidayImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<HolidayPreview | null>(null);
  const [replace, setReplace] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const runPreview = (sheet?: string) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setMsg(null);
    start(async () => {
      const res = await previewHolidays(file, sheet);
      if (res.ok) setPreview(res.data!);
      else {
        setPreview(null);
        setMsg({ ok: false, text: res.error });
      }
    });
  };

  const years = preview ? [...new Set(preview.rows.map((r) => Number(r.holiday_date.slice(0, 4)) + 543))].sort() : [];

  const commit = () => {
    if (!preview) return;
    start(async () => {
      const res = await commitHolidays(preview.rows, replace, preview.fileName);
      if (res.ok) {
        setMsg({ ok: true, text: `บันทึกวันหยุด ${res.data!.saved} วัน${res.data!.deleted ? ` (ลบรายการเดิม ${res.data!.deleted} วัน)` : ""}` });
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
      } else setMsg({ ok: false, text: res.error });
    });
  };

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">อัปโหลดตารางวันหยุดจาก Excel</h2>
          <p className="mt-0.5 text-xs text-muted">
            คอลัมน์: วันที่ · ชื่อวันหยุด · ประเภท (ราชการ/บริษัท) · บริษัทหยุด (ใช่/ไม่) · หมายเหตุ —{" "}
            <a className="text-accent underline" href={asset("/templates/holidays-2569.xlsx")} download>ไฟล์วันหยุดราชการ 2569</a>
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-sm" onChange={() => runPreview()} />
      </div>
      {pending && <p className="mt-3 text-sm text-muted">กำลังอ่านไฟล์…</p>}
      {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}

      {preview && (
        <div className="mt-4 space-y-3">
          {preview.sheetNames.length > 1 && (
            <select className="input w-auto py-1 text-sm" value={preview.sheet} onChange={(e) => runPreview(e.target.value)}>
              {preview.sheetNames.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          <IssuesList issues={preview.issues} />
          {preview.rows.length > 0 && (
            <>
              <div className="max-h-96 overflow-auto rounded-lg border border-line">
                <table className="table">
                  <thead className="sticky top-0 bg-card"><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th>ประเภท</th><th>หมายเหตุ</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r._row}>
                        <td className="whitespace-nowrap">{fmtDate(r.holiday_date, { weekday: "short" })}</td>
                        <td>{r.name}</td>
                        <td><HolidayBadge h={r} /></td>
                        <td className="text-xs text-muted">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  แทนที่วันหยุดเดิมทั้งหมดของปี {years.join(", ")}
                </label>
                <div className="flex gap-2">
                  <button className="btn" onClick={() => setPreview(null)} disabled={pending}>ยกเลิก</button>
                  <button className="btn btn-primary" onClick={commit} disabled={pending}>บันทึก {preview.rows.length} วัน</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
