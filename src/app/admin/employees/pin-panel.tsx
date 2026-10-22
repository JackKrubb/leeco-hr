"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generatePinsAction, type PinSlip } from "@/app/actions/admin";

export function PinSlips({ slips, onClose }: { slips: PinSlip[]; onClose: () => void }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        <span>PIN แสดงครั้งเดียวเท่านั้น — พิมพ์หรือจดไว้แจกพนักงานก่อนปิดหน้านี้</span>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={() => window.print()}>พิมพ์</button>
          <button className="btn btn-sm" onClick={onClose}>ปิด</button>
        </div>
      </div>
      <div className="print-area grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slips.map((s) => (
          <div key={s.emp_code} className="rounded-lg border border-dashed border-ink/40 px-3 py-2 text-sm break-inside-avoid">
            <p className="font-medium">{s.prefix ?? ""}{s.name}</p>
            <p className="text-xs text-muted">{s.work_group ?? ""}</p>
            <div className="mt-1 flex justify-between font-mono">
              <span>รหัส <b>{s.emp_code}</b></span>
              <span>PIN <b className="tracking-widest">{s.pin}</b></span>
            </div>
            <p className="mt-1 text-[10px] text-muted">เข้าระบบครั้งแรกจะให้ตั้ง PIN ใหม่</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PinPanel({ missing }: { missing: number }) {
  const router = useRouter();
  const [slips, setSlips] = useState<PinSlip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const generate = () => {
    if (!confirm(`สร้าง PIN ให้พนักงาน ${missing} คนที่ยังไม่มี PIN?`)) return;
    start(async () => {
      const res = await generatePinsAction();
      if (res.ok) {
        setSlips(res.data ?? []);
        router.refresh();
      } else setError(res.error);
    });
  };

  if (!missing && !slips) return null;
  return (
    <section className="card p-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">PIN เข้าระบบ</h2>
          <p className="text-xs text-muted">{missing ? `มีพนักงาน ${missing} คนยังไม่มี PIN — ยังลงเวลาไม่ได้` : "ทุกคนมี PIN แล้ว"}</p>
        </div>
        {missing > 0 && <button className="btn btn-primary" onClick={generate} disabled={pending}>{pending ? "กำลังสร้าง…" : `สร้าง PIN (${missing} คน)`}</button>}
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      {slips && <PinSlips slips={slips} onClose={() => setSlips(null)} />}
    </section>
  );
}
