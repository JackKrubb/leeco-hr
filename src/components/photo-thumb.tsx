"use client";

import { useState } from "react";

/** Small selfie thumbnail; click to view it larger. */
export function PhotoThumb({ src, label }: { src?: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return <span className="inline-block size-9 rounded-md border border-dashed border-line" title="ไม่มีรูป" />;
  return (
    <>
      <button onClick={() => setOpen(true)} title={label} className="inline-block size-9 overflow-hidden rounded-md ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="size-full object-cover" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6" onClick={() => setOpen(false)}>
          <figure className="rounded-2xl bg-card p-3 shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="size-64 rounded-xl object-cover" />
            <figcaption className="mt-2 text-center text-sm">{label}</figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
