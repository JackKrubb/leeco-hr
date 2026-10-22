"use client";

import { useEffect, useState } from "react";
import { messageOf, rpc } from "@/lib/api";
import type { RosterPerson } from "@/lib/kiosk";
import { fmtTime } from "@/lib/format";
import type { Attendance } from "@/lib/types";
import { allowed, nextStamp, STAMPS, type StampKind } from "@/lib/stamps";
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
  const [busy, setBusy] = useState<StampKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: StampKind; a: Attendance } | null>(null);

  const can = allowed(person);
  const next = nextStamp(person);
  const finished = !!person.check_out_at;
  const name = `${person.prefix ?? ""}${person.first_name} ${person.last_name}`.trim();

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [done, onDone]);

  const submit = async (kind: StampKind) => {
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
          (() => {
            const meta = STAMPS.find((x) => x.kind === done.kind)!;
            const at = done.a[meta.field];
            const badge =
              done.kind === "in"
                ? done.a.late_minutes > 0
                  ? ["bg-warn-soft text-warn", `สาย ${done.a.late_minutes} นาที`]
                  : ["bg-ok-soft text-ok", "ตรงเวลา"]
                : done.kind === "break_out"
                  ? done.a.break_early_minutes > 0
                    ? ["bg-early-soft text-early", `ออกพักก่อนเวลา ${done.a.break_early_minutes} นาที`]
                    : ["bg-ok-soft text-ok", "พักเที่ยงตามเวลา"]
                  : done.kind === "break_in"
                    ? done.a.break_late_minutes > 0
                      ? ["bg-warn-soft text-warn", `กลับจากพักสาย ${done.a.break_late_minutes} นาที`]
                      : ["bg-ok-soft text-ok", "กลับตรงเวลา"]
                    : done.a.early_minutes > 0
                      ? ["bg-early-soft text-early", `กลับก่อนเวลา ${done.a.early_minutes} นาที`]
                      : ["bg-ok-soft text-ok", "ครบเวลาทำงาน"];
            return (
              <div className="py-8 text-center">
                <div className={`mx-auto flex size-20 items-center justify-center rounded-full text-4xl text-white ${done.kind === "out" ? "bg-ink" : "bg-ok"}`}>✓</div>
                <p className="mt-4 text-lg font-semibold">{meta.done}</p>
                <p className="mt-1 text-sm text-muted">{name}</p>
                <p className="mt-3 font-mono text-4xl font-semibold tabular-nums">{fmtTime(at)}</p>
                <div className="mt-3">
                  <span className={`badge ${badge[0]}`}>{badge[1]}</span>
                </div>
                <button className="btn mt-6" onClick={onDone}>เสร็จ</button>
              </div>
            );
          })()
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold leading-tight">{name}{person.nickname ? ` (${person.nickname})` : ""}</p>
                <p className="text-xs text-muted">{person.emp_code}{person.work_group ? ` · ${person.work_group}` : ""}</p>
                <dl className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
                  {STAMPS.map((st) => (
                    <div key={st.kind} className={`rounded-lg px-1 py-1.5 ${person[st.field] ? "bg-ok-soft text-ok" : "bg-paper text-muted"}`}>
                      <dt className="leading-tight">{st.label}</dt>
                      <dd className="font-mono text-sm font-semibold tabular-nums">{person[st.field] ? fmtTime(person[st.field]) : "–"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <button className="btn btn-sm" onClick={onClose} aria-label="ปิด">✕</button>
            </div>

            {finished ? (
              <p className="rounded-lg bg-ok-soft px-3 py-3 text-center text-sm text-ok">วันนี้ลงเวลาครบแล้ว</p>
            ) : (
              <>
                <SelfieCamera photo={photo} onChange={setPhoto} />
                <p className="mt-3 text-center text-xs text-muted">
                  {photo ? "รูปพร้อมแล้ว — กดปุ่มด้านล่างเพื่อลงเวลา" : "ถ่ายรูปหน้าตัวเองก่อน ถึงจะกดลงเวลาได้"}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {STAMPS.map((st) => (
                    <button
                      key={st.kind}
                      className={`btn py-4 text-base ${st.kind === next ? "btn-primary" : ""}`}
                      disabled={!photo || !can[st.kind] || !!busy}
                      onClick={() => submit(st.kind)}
                    >
                      {busy === st.kind ? "กำลังบันทึก…" : st.label}
                    </button>
                  ))}
                </div>
                {next === "break_in" && can.out && (
                  <p className="mt-2 text-center text-xs text-muted">ถ้าลากลับบ้านช่วงพักเที่ยง กด “ออกงาน” ได้เลย</p>
                )}
              </>
            )}
            {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
