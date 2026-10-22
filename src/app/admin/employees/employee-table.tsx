"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { resetPinAction, type PinSlip } from "@/app/actions/admin";
import { fmtDate, fullName } from "@/lib/format";
import type { Employee } from "@/lib/types";
import { PinSlips } from "./pin-panel";

export function EmployeeTable({ employees }: { employees: Employee[] }) {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [slip, setSlip] = useState<PinSlip | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter(
      (e) =>
        (showInactive || e.active) &&
        (!needle ||
          [e.emp_code, e.first_name, e.last_name, e.nickname, e.work_group, e.department, e.position, e.company]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))),
    );
  }, [employees, q, showInactive]);

  const reset = (e: Employee) => {
    if (!confirm(`รีเซ็ต PIN ของ ${fullName(e, false)}? PIN เดิมจะใช้ไม่ได้ทันที`)) return;
    start(async () => {
      const res = await resetPinAction(e.id);
      if (res.ok) setSlip({ ...res.data!, prefix: e.prefix, work_group: e.work_group });
      else alert(res.error);
    });
  };

  return (
    <section className="card">
      <div className="no-print flex flex-wrap items-center gap-3 border-b border-line p-3">
        <input className="input max-w-xs" placeholder="ค้นหา ชื่อ / รหัส / แผนก…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> แสดงคนที่ปิดสถานะ
        </label>
        <span className="ml-auto text-xs text-muted">{rows.length} คน</span>
      </div>
      {slip && <div className="p-3"><PinSlips slips={[slip]} onClose={() => setSlip(null)} /></div>}
      <div className="no-print overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ฝ่าย / แผนก</th><th>ตำแหน่ง</th><th>บริษัท</th><th>เริ่มงาน</th><th>PIN</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={e.active ? "" : "opacity-50"}>
                <td className="tabular-nums text-muted">{e.emp_code}</td>
                <td className="whitespace-nowrap">
                  {fullName(e)}
                  {e.role === "admin" && <span className="ml-1 badge bg-ink text-white">แอดมิน</span>}
                  {!e.active && <span className="ml-1 badge bg-paper text-muted">ปิดสถานะ</span>}
                </td>
                <td className="whitespace-nowrap">{e.work_group}{e.department && e.department !== e.work_group ? <span className="text-muted"> / {e.department}</span> : ""}</td>
                <td>{e.position}</td>
                <td>{e.company}</td>
                <td className="whitespace-nowrap">{fmtDate(e.start_date)}</td>
                <td>
                  {e.locked ? <span className="badge bg-bad-soft text-bad">ล็อก</span>
                    : !e.has_pin ? <span className="badge bg-warn-soft text-warn">ยังไม่มี</span>
                    : e.must_change_pin ? <span className="badge bg-paper text-muted">รอเปลี่ยน</span>
                    : <span className="badge bg-ok-soft text-ok">ใช้งาน</span>}
                </td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn btn-sm" onClick={() => reset(e)} disabled={pending}>รีเซ็ต PIN</button>{" "}
                  <Link className="btn btn-sm" href={`/admin/employees/${e.id}`}>แก้ไข</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
