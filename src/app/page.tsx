"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { messageOf, RpcError } from "@/lib/api";
import { absorbKioskKeyFromUrl, getKioskKey, loadRoster, type Roster, type RosterPerson } from "@/lib/kiosk";
import { useClientValue } from "@/lib/use-client-value";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { Brand } from "@/components/brand";
import { StampSheet } from "@/components/kiosk/stamp-sheet";

type Filter = "all" | "todo" | "in" | "out";

function useClock(serverTime: string | undefined) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!serverTime) return;
    const offset = new Date(serverTime).getTime() - Date.now();
    const tick = () => setNow(new Date(Date.now() + offset));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverTime]);
  return now;
}

function status(p: RosterPerson) {
  if (!p.check_in_at) return { key: "todo" as const, label: "ยังไม่เข้างาน", cls: "bg-paper text-muted" };
  if (!p.check_out_at)
    return { key: "in" as const, label: `เข้า ${fmtTime(p.check_in_at)}${p.late_minutes ? ` · สาย ${p.late_minutes}` : ""}`, cls: p.late_minutes ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok" };
  return { key: "out" as const, label: `ออก ${fmtTime(p.check_out_at)}`, cls: "bg-ink/5 text-ink" };
}

export default function KioskPage() {
  const key = useClientValue(() => {
    absorbKioskKeyFromUrl();
    return getKioskKey();
  });
  const [refresh, setRefresh] = useState(0);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badKey, setBadKey] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<RosterPerson | null>(null);

  useEffect(() => {
    if (!key) return;
    const run = () =>
      loadRoster(key)
        .then((r) => {
          setRoster(r);
          setError(null);
        })
        .catch((e) => {
          if (e instanceof RpcError && e.code === "KIOSK_KEY") setBadKey(true);
          else setError(messageOf(e));
        });
    run();
    const id = setInterval(run, 60_000);
    return () => clearInterval(id);
  }, [key, refresh]);

  const now = useClock(roster?.server_time);
  const clock = now
    ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now)
    : "--:--:--";

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (roster?.employees ?? []).filter((p) => {
      if (filter !== "all" && status(p).key !== filter) return false;
      if (!needle) return true;
      return [p.first_name, p.last_name, p.nickname, p.emp_code].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
    const m = new Map<string, RosterPerson[]>();
    for (const p of list) m.set(p.work_group || "อื่น ๆ", [...(m.get(p.work_group || "อื่น ๆ") ?? []), p]);
    return [...m.entries()];
  }, [roster, q, filter]);

  if (key === undefined) return null;

  if (!key || badKey) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
        <Brand />
        <h1 className="mt-6 text-2xl font-semibold">ลงเวลาทำงาน</h1>
        <p className="mt-2 text-sm text-muted">
          {badKey ? "ลิงก์ลงเวลานี้ถูกเปลี่ยนแล้ว" : "อุปกรณ์นี้ยังไม่ได้เปิดใช้"} — เปิดลิงก์ลงเวลาที่ได้จาก HR อีกครั้ง
        </p>
        <Link href="/login/" className="mt-8 text-xs text-muted underline">สำหรับ HR: เข้าสู่ระบบหลังบ้าน</Link>
      </main>
    );
  }

  const counts = roster
    ? {
        todo: roster.employees.filter((p) => !p.check_in_at).length,
        in: roster.employees.filter((p) => p.check_in_at && !p.check_out_at).length,
        out: roster.employees.filter((p) => p.check_out_at).length,
      }
    : { todo: 0, in: 0, out: 0 };
  const offHoliday = roster?.holidays.find((h) => h.company_off);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between pt-5 pb-4">
        <Brand sub="ลงเวลา" />
        <div className="flex items-center gap-2 text-xs">
          <Link href="/calendar/" className="btn btn-sm">ปฏิทินวันหยุด</Link>
          <Link href="/login/" className="text-muted underline">HR</Link>
        </div>
      </header>

      <section className="card mb-4 flex flex-wrap items-end justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm text-muted">{roster ? fmtDateLong(roster.today) : " "}</p>
          <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl" suppressHydrationWarning>{clock}</p>
        </div>
        {roster && <p className="text-xs text-muted">เวลาทำงาน {roster.settings.work_start}–{roster.settings.work_end} น.</p>}
      </section>

      {offHoliday && (
        <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-public">วันนี้วันหยุด: {offHoliday.name} — ถ้ามาทำงานยังลงเวลาได้</p>
      )}
      {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

      <div className="sticky top-0 z-10 -mx-4 mb-3 space-y-2 bg-paper/95 px-4 py-2 backdrop-blur">
        <input className="input py-3 text-base" placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1.5 overflow-x-auto text-sm">
          {([
            ["all", `ทั้งหมด ${roster?.employees.length ?? ""}`],
            ["todo", `ยังไม่เข้า ${counts.todo}`],
            ["in", `อยู่ในงาน ${counts.in}`],
            ["out", `ออกแล้ว ${counts.out}`],
          ] as [Filter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-3 py-1.5 ${filter === k ? "bg-ink text-white" : "border border-line bg-card text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!roster ? (
        <p className="py-10 text-center text-sm text-muted">กำลังโหลดรายชื่อ…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">ไม่พบชื่อ</p>
      ) : (
        <div className="space-y-5">
          {groups.map(([g, people]) => (
            <section key={g}>
              <h2 className="eyebrow mb-2">{g}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {people.map((p) => {
                  const s = status(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="card flex items-center justify-between gap-3 px-4 py-3 text-left transition hover:border-ink/40 active:scale-[0.99]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base font-medium">
                          {p.first_name} {p.last_name}
                          {p.nickname && <span className="text-muted"> ({p.nickname})</span>}
                        </span>
                        <span className="block text-xs text-muted">{p.emp_code}{p.position ? ` · ${p.position}` : ""}</span>
                      </span>
                      <span className={`badge shrink-0 ${s.cls}`}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && roster && (
        <StampSheet
          person={selected}
          kioskKey={key}
          requireLocation={roster.settings.require_location}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
