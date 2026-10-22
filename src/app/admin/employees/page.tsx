import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { rpc } from "@/lib/db";
import type { Employee } from "@/lib/types";
import { EmployeeImportPanel } from "./import-panel";
import { PinPanel } from "./pin-panel";
import { EmployeeTable } from "./employee-table";

export default async function EmployeesPage() {
  const { token } = await requireAdmin();
  const employees = await rpc<Employee[]>("hr_admin_employees", { p_token: token });
  const active = employees.filter((e) => e.active);
  const missingPin = active.filter((e) => !e.has_pin).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">ข้อมูลพนักงาน</p>
          <h1 className="h1">พนักงาน {active.length} คน</h1>
        </div>
        <Link href="/admin/employees/new" className="btn btn-dark">+ เพิ่มพนักงาน</Link>
      </div>
      <div className="no-print"><EmployeeImportPanel existingCount={active.length} /></div>
      <PinPanel missing={missingPin} />
      <EmployeeTable employees={employees} />
    </div>
  );
}
