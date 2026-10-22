"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkInAction, checkOutAction, type Loc } from "@/app/actions/attendance";
import { fmtTime, fmtDuration } from "@/lib/format";
import type { Attendance } from "@/lib/types";

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

function useClock(serverTime: string) {
  const [offset] = useState(() => new Date(serverTime).getTime() - Date.now());
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + offset));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

export function CheckInPanel({
  serverTime,
  initial,
  workStart,
  workEnd,
  requireLocation,
  tracked,
}: {
  serverTime: string;
  initial: Attendance | null;
  workStart: string;
  workEnd: string;
  requireLocation: boolean;
  tracked: boolean;
}) {
  const router = useRouter();
  const now = useClock(serverTime);
  const [att, setAtt] = useState<Attendance | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const clock = now
    ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now)
    : "--:--:--";

  const run = (kind: "in" | "out") => {
    setError(null);
    startTransition(async () => {
      setStep("กำลังหาตำแหน่ง…");
      const loc = await getLocation(requireLocation ? 12_000 : 6_000);
      if (!loc && requireLocation) {
        setStep(null);
        setError("หาตำแหน่งไม่ได้ — เปิด GPS และอนุญาตให้เว็บนี้เข้าถึงตำแหน่ง แล้วลองอีกครั้ง");
        return;
      }
      setStep("กำลังบันทึก…");
      const res = kind === "in" ? await checkInAction(loc) : await checkOutAction(loc);
      setStep(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAtt(res.data ?? null);
      router.refresh();
    });
  };

  if (!tracked) {
    return <div className="card p-5 text-sm text-muted">บัญชีนี้เป็นบัญชีผู้ดูแลระบบ ไม่ได้ใช้ลงเวลา</div>;
  }

  const checkedIn = !!att?.check_in_at;
  const checkedOut = !!att?.check_out_at;

  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-6 pb-5 text-center">
        <p className="eyebrow">เวลาขณะนี้</p>
        <p className="mt-1 font-mono text-5xl font-semibold tabular-nums tracking-tight" suppressHydrationWarning>{clock}</p>
        <p className="mt-2 text-xs text-muted">เวลาทำงาน {workStart}–{workEnd} น.</p>
      </div>

      <div className="grid grid-cols-2 border-t border-line text-center">
        <div className="border-r border-line px-3 py-4">
          <p className="text-xs text-muted">เข้างาน</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtTime(att?.check_in_at)}</p>
          {checkedIn && (
            att!.late_minutes > 0 ? (
              <span className="badge mt-1 bg-warn-soft text-warn">สาย {att!.late_minutes} นาที</span>
            ) : (
              <span className="badge mt-1 bg-ok-soft text-ok">ตรงเวลา</span>
            )
          )}
        </div>
        <div className="px-3 py-4">
          <p className="text-xs text-muted">ออกงาน</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtTime(att?.check_out_at)}</p>
          {checkedOut &&
            (att!.early_minutes > 0 ? (
              <span className="badge mt-1 bg-early-soft text-early">กลับก่อน {att!.early_minutes} นาที</span>
            ) : (
              <span className="badge mt-1 bg-paper text-muted">{fmtDuration(att!.check_in_at, att!.check_out_at)}</span>
            ))}
        </div>
      </div>

      <div className="border-t border-line p-4">
        {!checkedIn && (
          <button onClick={() => run("in")} disabled={pending} className="btn btn-primary w-full py-4 text-lg">
            {step ?? "ลงเวลาเข้างาน"}
          </button>
        )}
        {checkedIn && !checkedOut && (
          <button onClick={() => run("out")} disabled={pending} className="btn btn-dark w-full py-4 text-lg">
            {step ?? "ลงเวลาออกงาน"}
          </button>
        )}
        {checkedOut && <p className="py-2 text-center text-sm text-ok">ลงเวลาวันนี้ครบแล้ว ขอบคุณครับ/ค่ะ</p>}
        {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        {requireLocation && !checkedOut && <p className="mt-3 text-center text-xs text-muted">ต้องอยู่ในพื้นที่บริษัทและเปิดตำแหน่ง (GPS)</p>}
      </div>
    </section>
  );
}
