"use client";

import { useRef, useState, useTransition } from "react";
import { commitEmployees, previewEmployees, type EmployeeImportSummary, type EmployeePreview } from "@/lib/actions/admin";
import { asset } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { IssuesList } from "@/components/issues-list";

export function EmployeeImportPanel({ existingCount }: { existingCount: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<EmployeePreview | null>(null);
  const [result, setResult] = useState<EmployeeImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deactivate, setDeactivate] = useState(false);
  const [pending, start] = useTransition();

  const runPreview = (sheet?: string) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    start(async () => {
      const res = await previewEmployees(file, sheet);
      if (res.ok) setPreview(res.data!);
      else {
        setPreview(null);
        setError(res.error);
      }
    });
  };

  const commit = () => {
    if (!preview) return;
    start(async () => {
      const res = await commitEmployees(preview.rows, deactivate, preview.fileName);
      if (res.ok) {
        setResult(res.data!);
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
      } else setError(res.error);
    });
  };

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">นำเข้ารายชื่อพนักงานจาก Excel</h2>
          <p className="mt-0.5 text-xs text-muted">
            ใช้ไฟล์รายชื่อแบบเดิมของ HR ได้เลย หรือใช้ <a className="text-accent underline" href={asset("/templates/employees-template.xlsx")} download>แม่แบบ</a> ·
            คนเดิมจับคู่จากรหัสหรือชื่อ-นามสกุล · ไม่นำเข้าค่าแรง
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-sm" onChange={() => runPreview()} />
      </div>

      {pending && <p className="mt-3 text-sm text-muted">กำลังอ่านไฟล์…</p>}
      {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      {result && (
        <p className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          นำเข้าแล้ว: เพิ่มใหม่ {result.inserted} · อัปเดต {result.updated}{result.deactivated ? ` · ปิดสถานะ ${result.deactivated}` : ""} คน
        </p>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">{preview.fileName}</span>
            {preview.sheetNames.length > 1 && (
              <label className="flex items-center gap-2">
                <span className="text-xs text-muted">ชีต</span>
                <select className="input w-auto py-1" value={preview.sheet} onChange={(e) => runPreview(e.target.value)}>
                  {preview.sheetNames.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            )}
            <span className="badge bg-ink text-white">{preview.rows.length} คน</span>
            {preview.ignoredColumns.length > 0 && <span className="text-xs text-muted">ไม่นำเข้าคอลัมน์: {preview.ignoredColumns.join(", ")}</span>}
          </div>
          <IssuesList issues={preview.issues} />
          {preview.rows.length > 0 && (
            <>
              <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
                <table className="table">
                  <thead className="sticky top-0 bg-card">
                    <tr><th>#</th><th>ชื่อ-นามสกุล</th><th>ฝ่าย</th><th>แผนก</th><th>ตำแหน่ง</th><th>บริษัท</th><th>เริ่มงาน</th><th>หมายเหตุ</th></tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r._row}>
                        <td className="text-muted tabular-nums">{r.sort_order ?? r._row}</td>
                        <td className="whitespace-nowrap">{r.prefix}{r.first_name} {r.last_name}{r.nickname ? ` (${r.nickname})` : ""}</td>
                        <td>{r.work_group}</td>
                        <td>{r.department}</td>
                        <td>{r.position}</td>
                        <td>{r.company}</td>
                        <td className="whitespace-nowrap">{r.start_date ? fmtDate(r.start_date) : <span className="text-warn">-</span>}</td>
                        <td className="text-xs text-muted">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
                  ปิดสถานะพนักงานที่ไม่มีในไฟล์นี้ (ลาออก){existingCount ? ` — ตอนนี้มี ${existingCount} คนในระบบ` : ""}
                </label>
                <div className="flex gap-2">
                  <button className="btn" onClick={() => setPreview(null)} disabled={pending}>ยกเลิก</button>
                  <button className="btn btn-primary" onClick={commit} disabled={pending}>บันทึก {preview.rows.length} คนเข้าระบบ</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
