import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { rpc } from "@/lib/db";
import { fullName } from "@/lib/format";
import type { Employee } from "@/lib/types";
import { EmployeeForm } from "./employee-form";

export default async function EmployeeEditPage({ params }: PageProps<"/admin/employees/[id]">) {
  const { id } = await params;
  const { me, token } = await requireAdmin();
  const all = await rpc<Employee[]>("hr_admin_employees", { p_token: token });
  const e = id === "new" ? null : all.find((x) => x.id === id);
  if (id !== "new" && !e) notFound();

  const uniq = (k: keyof Employee) => [...new Set(all.map((x) => x[k]).filter((v): v is string => typeof v === "string" && v !== ""))].sort();
  const suggestions = { work_group: uniq("work_group"), department: uniq("department"), position: uniq("position"), company: uniq("company"), prefix: ["นาย", "นาง", "น.ส."] };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">{e ? e.emp_code : "พนักงานใหม่"}</p>
        <h1 className="h1">{e ? fullName(e) : "เพิ่มพนักงาน"}</h1>
        {!e && <p className="text-xs text-muted">หลังบันทึก กด “สร้าง PIN” ในหน้าพนักงานเพื่อให้เข้าระบบได้</p>}
      </div>
      <EmployeeForm e={e ?? null} isSelf={e?.id === me.employee.id} suggestions={suggestions} />
    </div>
  );
}
