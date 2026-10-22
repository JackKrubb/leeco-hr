"use client";

import Link from "next/link";
import { useAuthed } from "@/lib/use-authed";
import { thaiMonth } from "@/lib/calendar";

export type PhotoMonth = {
  month: string;
  photos: number;
  bytes: number;
  ended: boolean;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  all_deleted_by: string | null;
};

/** Reminds HR about finished months whose report hasn't been reviewed (their photos can't be deleted yet). */
export function PhotoStatusBanner() {
  const { data } = useAuthed<PhotoMonth[]>("hr_admin_photo_status");
  const pending = (data ?? []).filter((m) => m.ended && !m.reviewed && m.photos > 0);
  if (!pending.length) return null;
  return (
    <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
      <p className="font-medium">ยังไม่ได้ตรวจรีพอร์ต: รูปของเดือนเหล่านี้ยังลบไม่ได้</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {pending.map((m) => {
          const [y, mo] = m.month.split("-").map(Number);
          return (
            <li key={m.month}>
              <Link className="underline" href={`/admin/reports/monthly/?m=${m.month.slice(0, 7)}`}>
                {thaiMonth(y, mo)}
              </Link>{" "}
              · {m.photos} รูป ({(m.bytes / 1024 / 1024).toFixed(1)} MB)
            </li>
          );
        })}
      </ul>
    </div>
  );
}
