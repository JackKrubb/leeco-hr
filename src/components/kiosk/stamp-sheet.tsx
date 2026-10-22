"use client";

import { useEffect, useState } from "react";
import { messageOf, rpc } from "@/lib/api";
import type { RosterPerson } from "@/lib/kiosk";
import { fmtTime } from "@/lib/format";
import type { Attendance } from "@/lib/types";
import { SelfieCamera } from "./selfie-camera";

type Loc = { lat: number; lng: number; accuracy: number } | null;

function getLocation(timeoutMs: number): Promise<Loc> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export function StampSheet({
  person,
  kioskKey,
  requireLocation,
  onClose,
  onDone,
}: {
  person: RosterPerson;
  kioskKey: string;
  requireLocation: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: "in" | "out"; a: Attendance } | null>(null);

  const checkedIn = !!person.check_in_at;
  const checkedOut = !!person.check_out_at;
  const name = `${person.prefix ?? ""}${person.first_name} ${person.last_name}`.trim();

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [done, onDone]);

  const submit = async (kind: "in" | "out") => {
    if (!photo) {
      setError("ต้องถ่ายรูปหน้าตัวเองก่อน");
      return;
    }
    setError(null);
    setBusy(kind);
    try {
      const loc = await getLocation(requireLocation ? 12_000 : 4_000);
      if (!loc && requireLocation) throw new Error("หาตำแหน่งไม่ได้ — เปิด GPS และอนุญาตตำแหน่ง แล้วลองอีกครั้ง");
      const a = await rpc<Attendance>("hr_kiosk_stamp", {
        p_key: kioskKey,
        p_employee_id: person.id,
        p_kind: kind,
        p_photo: photo,
        p_lat: loc?.lat ?? null,
        p_lng: loc?.lng ?? null,
        p_accuracy: loc ? Math.round(loc.accuracy) : null,
      });
      setDone({ kind, a });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 shadow-xl sm:max-w-md sm:rounded-3xl">
        {done ? (
          <div className="py-8 text-center">
            <div className={`mx-auto flex size-20 items-center justify-center rounded-full text-4xl text-white ${done.kind === "in" ? "bg-ok" : "bg-ink"}`}>✓</div>
            <p className="mt-4 text-lg font-semibold">{done.kind === "in" ? "ลงเวลาเข้างานแล้ว" : "ลงเวลาออกงานแล้ว"}</p>
            <p className="mt-1 text-sm text-muted">{name}</p>
            <p className="mt-3 font-mono text-4xl font-semibold tabular-nums">
              {fmtTime(done.kind === "in" ? done.a.check_in_at : done.a.check_out_at)}
            </p>
            <div className="mt-3">
              {done.kind === "in" &&
                (done.a.late_minutes > 0 ? (
                  <span className="badge bg-warn-soft text-warn">สาย {done.a.late_minutes} นาที</span>
                ) : (
                  <span className="badge bg-ok-soft text-ok">ตรงเวลา</span>
                ))}
              {done.kind === "out" &&
                (done.a.early_minutes > 0 ? (
                  <span className="badge bg-early-soft text-early">กลับก่อนเวลา {done.a.early_minutes} นาที</span>
                ) : (
                  <span className="badge bg-ok-soft text-ok">ครบเวลาทำงาน</span>
                ))}
            </div>
            <button className="btn mt-6" onClick={onDone}>เสร็จ</button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold leading-tight">{name}{person.nickname ? ` (${person.nickname})` : ""}</p>
                <p className="text-xs text-muted">{person.emp_code}{person.work_group ? ` · ${person.work_group}` : ""}</p>
                <p className="mt-1 text-sm">
                  {!checkedIn ? "ยังไม่ได้ลงเวลาวันนี้" : checkedOut ? `เข้า ${fmtTime(person.check_in_at)} · ออก ${fmtTime(person.check_out_at)}` : `เข้างานแล้ว ${fmtTime(person.check_in_at)}`}
                </p>
              </div>
              <button className="btn btn-sm" onClick={onClose} aria-label="ปิด">✕</button>
            </div>

            {checkedOut ? (
              <p className="rounded-lg bg-ok-soft px-3 py-3 text-center text-sm text-ok">วันนี้ลงเวลาเข้า-ออกครบแล้ว</p>
            ) : (
              <>
                <SelfieCamera photo={photo} onChange={setPhoto} />
                <p className="mt-3 text-center text-xs text-muted">
                  {photo ? "รูปพร้อมแล้ว — กดปุ่มด้านล่างเพื่อลงเวลา" : "ถ่ายรูปหน้าตัวเองก่อน ถึงจะกดลงเวลาได้"}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button className="btn btn-primary py-4 text-base" disabled={!photo || checkedIn || !!busy} onClick={() => submit("in")}>
                    {busy === "in" ? "กำลังบันทึก…" : "เข้างาน"}
                  </button>
                  <button className="btn btn-dark py-4 text-base" disabled={!photo || !checkedIn || !!busy} onClick={() => submit("out")}>
                    {busy === "out" ? "กำลังบันทึก…" : "ออกงาน"}
                  </button>
                </div>
              </>
            )}
            {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
