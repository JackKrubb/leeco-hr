"use client";

import { useEffect, useRef, useState } from "react";

const SIZE = 240; // stored thumbnail is SIZE×SIZE JPEG, ~10–20 KB

/** Front-camera preview with a capture button. Calls onChange with a small JPEG data URL (or null on retake). */
export function SelfieCamera({ photo, onChange }: { photo: string | null; onChange: (dataUrl: string | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (photo) return;
    let cancelled = false;
    const stopStream = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    const open = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        })
      : Promise.reject(Object.assign(new Error("unsupported"), { name: "Unsupported" }));
    open
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (!cancelled) setReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        setError(
          name === "Unsupported"
            ? "เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ใช้ Chrome หรือ Safari และเปิดผ่านลิงก์ https"
            : name === "NotAllowedError"
              ? "ไม่ได้รับอนุญาตให้ใช้กล้อง — กดอนุญาตกล้องในเบราว์เซอร์ แล้วลองใหม่"
              : name === "NotFoundError"
                ? "ไม่พบกล้องบนอุปกรณ์นี้"
                : "เปิดกล้องไม่ได้ ลองใหม่อีกครั้ง",
        );
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [photo, attempt]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    // mirror so the saved picture matches what the person saw
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    onChange(canvas.toDataURL("image/jpeg", 0.72));
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl bg-ink">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="รูปที่ถ่าย" className="size-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        )}
        {!photo && !ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">กำลังเปิดกล้อง…</p>
        )}
        {!photo && ready && (
          <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-white/50" />
        )}
      </div>
      {error && (
        <div className="space-y-2 text-center">
          <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
          <button type="button" className="btn btn-sm" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>ลองเปิดกล้องอีกครั้ง</button>
        </div>
      )}
      <div className="flex justify-center">
        {photo ? (
          <button type="button" className="btn" onClick={() => { setReady(false); onChange(null); }}>ถ่ายใหม่</button>
        ) : (
          <button type="button" className="btn btn-dark px-6" onClick={capture} disabled={!ready}>
            📷 ถ่ายรูป
          </button>
        )}
      </div>
    </div>
  );
}
