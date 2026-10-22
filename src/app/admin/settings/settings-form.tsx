"use client";

import { useActionState, useState } from "react";
import { saveSettingsAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { WEEKDAYS_LONG } from "@/lib/format";
import type { Settings } from "@/lib/types";

export function SettingsForm({ s }: { s: Settings }) {
  const [state, action] = useActionState(saveSettingsAction, undefined);
  const [lat, setLat] = useState(s.site_lat?.toString() ?? "");
  const [lng, setLng] = useState(s.site_lng?.toString() ?? "");
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const useHere = () => {
    setLocMsg("กำลังหาตำแหน่ง…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setLocMsg(`ได้ตำแหน่งแล้ว (คลาดเคลื่อน ~${Math.round(p.coords.accuracy)} ม.) — กดบันทึกด้านล่าง`);
      },
      () => setLocMsg("หาตำแหน่งไม่ได้ — อนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์ก่อน"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <form action={action} className="space-y-5">
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">เวลาทำงาน</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-1"><label className="label">ชื่อบริษัท</label><input name="company_name" className="input" defaultValue={s.company_name} /></div>
          <div><label className="label">เวลาเข้างาน</label><input type="time" name="work_start" className="input" defaultValue={s.work_start} required /></div>
          <div><label className="label">เวลาเลิกงาน</label><input type="time" name="work_end" className="input" defaultValue={s.work_end} required /></div>
          <div><label className="label">ผ่อนผันมาสาย (นาที)</label><input type="number" min={0} max={120} name="late_grace_minutes" className="input" defaultValue={s.late_grace_minutes} /></div>
        </div>
        <div>
          <p className="label">วันทำงานปกติ</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS_LONG.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white">
                <input type="checkbox" name="work_days" value={i + 1} defaultChecked={s.work_days.includes(i + 1)} className="sr-only" />
                {d}
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">มาสาย = ลงเวลาเข้าหลัง (เวลาเข้างาน + ผ่อนผัน) ในวันทำงาน นับนาทีสายจากเวลาเข้างาน</p>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">ตำแหน่งที่ตั้งบริษัท (GPS)</h2>
          <button type="button" className="btn btn-sm" onClick={useHere}>ใช้ตำแหน่งปัจจุบันของฉัน</button>
        </div>
        {locMsg && <p className="text-xs text-muted">{locMsg}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">ละติจูด</label><input name="site_lat" className="input" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="13.6xxxxx" /></div>
          <div><label className="label">ลองจิจูด</label><input name="site_lng" className="input" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="100.6xxxxx" /></div>
          <div><label className="label">รัศมีที่อนุญาต (เมตร)</label><input type="number" min={50} max={5000} name="site_radius_m" className="input" defaultValue={s.site_radius_m} /></div>
        </div>
        {lat && lng && (
          <a className="text-xs text-accent underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lat},${lng}`}>เปิดดูจุดนี้ใน Google Maps</a>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="require_location" defaultChecked={s.require_location} className="mt-1" />
          <span>
            บังคับให้อยู่ในพื้นที่บริษัทตอนลงเวลา
            <span className="block text-xs text-muted">ถ้าปิดไว้ ระบบยังบันทึกระยะห่างไว้ให้ดูในรายงาน แต่ไม่ปฏิเสธการลงเวลา</span>
          </span>
        </label>
      </section>

      <section className="card space-y-2 p-5">
        <h2 className="text-sm font-semibold">การเข้าระบบ</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="require_pin" defaultChecked={s.require_pin} className="mt-1" />
          <span>
            พนักงานต้องใช้ PIN ตอนเข้าระบบ
            <span className="block text-xs text-muted">ปิดไว้ = โหมดทดสอบ: พนักงานเข้าด้วยรหัสพนักงานอย่างเดียว (ใครรู้รหัสก็ลงเวลาแทนได้) · ผู้ดูแลระบบต้องใช้ PIN เสมอ</span>
          </span>
        </label>
      </section>

      {state?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.message && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>}
      <div className="flex justify-end"><SubmitButton>บันทึกการตั้งค่า</SubmitButton></div>
    </form>
  );
}
