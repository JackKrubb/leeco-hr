"use client";

import Link from "next/link";
import { useAuthed } from "@/lib/use-authed";
import type { Employee } from "@/lib/types";
import { Loading } from "@/components/session";
import { EmployeeImportPanel } from "./import-panel";
import { EmployeeTable } from "./employee-table";

export default function EmployeesPage() {
  const q = useAuthed<Employee[]>("hr_admin_employees");
  if (!q.data) return <Loading error={q.error} />;
  const employees = q.data;
  const active = employees.filter((e) => e.active && e.track_attendance);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">ข้อมูลพนักงาน</p>
          <h1 className="h1">พนักงาน {active.length} คน</h1>
          <p className="text-xs text-muted">ทุกคนที่ “ยังทำงานอยู่” และ “ต้องลงเวลา” จะมีชื่อในหน้าลงเวลา</p>
        </div>
        <Link href="/admin/employees/edit/" className="btn btn-dark">+ เพิ่มพนักงาน</Link>
      </div>
      <div className="no-print"><EmployeeImportPanel existingCount={active.length} /></div>
      <EmployeeTable employees={employees} />
    </div>
  );
}
