"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthed } from "@/lib/use-authed";
import { fullName } from "@/lib/format";
import type { Employee } from "@/lib/types";
import { Loading, useMe } from "@/components/session";
import { EmployeeForm } from "./employee-form";

function Edit() {
  const id = useSearchParams().get("id");
  const me = useMe();
  const q = useAuthed<Employee[]>("hr_admin_employees");
  if (!q.data) return <Loading error={q.error} />;
  const all = q.data;
  const e = id ? all.find((x) => x.id === id) : null;
  if (id && !e) return <Loading error="ไม่พบพนักงานคนนี้" />;

  const uniq = (k: keyof Employee) => [...new Set(all.map((x) => x[k]).filter((v): v is string => typeof v === "string" && v !== ""))].sort();
  const suggestions = { work_group: uniq("work_group"), department: uniq("department"), position: uniq("position"), company: uniq("company"), prefix: ["นาย", "นาง", "น.ส."] };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">{e ? e.emp_code : "พนักงานใหม่"}</p>
        <h1 className="h1">{e ? fullName(e) : "เพิ่มพนักงาน"}</h1>
      </div>
      <EmployeeForm key={e?.id ?? "new"} e={e ?? null} isSelf={e?.id === me.employee.id} suggestions={suggestions} />
    </div>
  );
}

export default function EmployeeEditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Edit />
    </Suspense>
  );
}
