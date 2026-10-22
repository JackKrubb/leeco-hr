import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { rpc } from "@/lib/db";
import type { Employee, Settings } from "@/lib/types";
import { EmployeeImportPanel } from "./import-panel";
import { PinPanel } from "./pin-panel";
import { EmployeeTable } from "./employee-table";

export default async function EmployeesPage() {
  const { token } = await requireAdmin();
  const [employees, settings] = await Promise.all([
    rpc<Employee[]>("hr_admin_employees", { p_token: token }),
    rpc<Settings>("hr_admin_settings", { p_token: token }),
  ]);
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
      {settings.require_pin ? (
        <PinPanel missing={missingPin} />
      ) : (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          โหมดทดสอบ: พนักงานเข้าระบบด้วยรหัสพนักงานอย่างเดียว ไม่ต้องใช้ PIN — เปิดใช้ PIN ได้ที่ <Link className="underline" href="/admin/settings">ตั้งค่า</Link>
        </p>
      )}
      <EmployeeTable employees={employees} />
    </div>
  );
}
