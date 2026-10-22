"use client";

import { useState } from "react";
import { useAuthed } from "@/lib/use-authed";
import { rotateKioskKey } from "@/lib/actions/admin";
import { kioskLink } from "@/lib/kiosk";
import type { Settings } from "@/lib/types";
import { Loading } from "@/components/session";
import { SettingsForm } from "./settings-form";

function KioskLinkCard() {
  const q = useAuthed<{ kiosk_key: string }>("hr_admin_kiosk", { p_rotate: false });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!q.data) return <section className="card p-5 text-sm text-muted">{q.error ?? "กำลังโหลดลิงก์…"}</section>;
  const link = kioskLink(q.data.kiosk_key);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("คัดลอกลิงก์นี้", link);
    }
  };
  const rotate = async () => {
    if (!confirm("สร้างลิงก์ใหม่? ลิงก์เดิมจะใช้ไม่ได้ทันที ทุกเครื่องต้องเปิดลิงก์ใหม่")) return;
    setBusy(true);
    const res = await rotateKioskKey();
    setBusy(false);
    if (!res.ok) alert(res.error);
  };

  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="text-sm font-semibold">ลิงก์หน้าลงเวลา (สำหรับพนักงาน)</h2>
        <p className="text-xs text-muted">
          เปิดลิงก์นี้บนแท็บเล็ตหน้าโรงงาน หรือส่งให้พนักงานใน LINE กลุ่ม — เปิดครั้งเดียว เครื่องจะจำไว้ ไม่ต้องเข้าสู่ระบบ ·
          คนที่ไม่มีลิงก์จะไม่เห็นรายชื่อพนักงาน
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input readOnly value={link} className="input min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button className="btn btn-dark" onClick={copy}>{copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}</button>
        <a className="btn" href={link} target="_blank" rel="noreferrer">เปิดหน้าลงเวลา</a>
      </div>
      <button className="text-xs text-bad underline" onClick={rotate} disabled={busy}>ลิงก์หลุดไปที่อื่น? สร้างลิงก์ใหม่ (ลิงก์เดิมใช้ไม่ได้ทันที)</button>
    </section>
  );
}

export default function SettingsPage() {
  const q = useAuthed<Settings>("hr_admin_settings");
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">ตั้งค่า</p>
        <h1 className="h1">ลิงก์ลงเวลา และกติกาการลงเวลา</h1>
      </div>
      <KioskLinkCard />
      {q.data ? <SettingsForm key={JSON.stringify(q.data)} s={q.data} /> : <Loading error={q.error} />}
      <section className="card space-y-1 p-5 text-sm">
        <h2 className="font-semibold">รูปถ่ายตอนลงเวลา</h2>
        <p className="text-xs text-muted">
          เก็บเป็นรูปเล็ก (ประมาณ 10–20 KB ต่อรูป) · รูปของเดือนไหนจะถูกลบก็ต่อเมื่อ HR กด “ยืนยันว่าตรวจรีพอร์ตเดือนนี้แล้ว” ในรายงานรายเดือน
          และรูปมีอายุเกิน 30 วัน — ระบบลบให้อัตโนมัติทุกวันตอนตี 3 · เดือนที่ยังไม่ได้ตรวจ รูปจะไม่ถูกลบเด็ดขาด
        </p>
      </section>
    </div>
  );
}
