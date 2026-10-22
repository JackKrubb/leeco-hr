"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveEmployeeAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import type { Employee } from "@/lib/types";

export function EmployeeForm({ e, isSelf, suggestions }: { e: Employee | null; isSelf: boolean; suggestions: Record<string, string[]> }) {
  const [state, action] = useActionState(saveEmployeeAction, undefined);
  const field = (name: keyof Employee, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" defaultValue={(e?.[name] as string | number | null) ?? ""} list={suggestions[name] ? `${name}-list` : undefined} {...props} />
      {suggestions[name] && (
        <datalist id={`${name}-list`}>{suggestions[name].map((v) => <option key={v} value={v} />)}</datalist>
      )}
    </div>
  );

  return (
    <form action={action} className="card space-y-5 p-5">
      <input type="hidden" name="id" value={e?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-3">
        {field("emp_code", "รหัสพนักงาน", { placeholder: e ? "" : "เว้นว่าง = สร้างอัตโนมัติ" })}
        {field("sort_order", "ลำดับ", { type: "number", min: 0 })}
        {field("start_date", "วันเริ่มงาน", { type: "date" })}
      </div>
      <div className="grid gap-4 sm:grid-cols-[110px_1fr_1fr_140px]">
        {field("prefix", "คำนำหน้า")}
        {field("first_name", "ชื่อ *", { required: true })}
        {field("last_name", "นามสกุล")}
        {field("nickname", "ชื่อเล่น")}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {field("work_group", "ฝ่าย")}
        {field("department", "แผนก")}
        {field("position", "ตำแหน่ง")}
        {field("company", "บริษัท")}
      </div>
      {field("note", "หมายเหตุ")}

      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={e?.active ?? true} disabled={isSelf} />
          ยังทำงานอยู่
          {isSelf && <input type="hidden" name="active" value="on" />}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="track_attendance" defaultChecked={e?.track_attendance ?? true} />
          ต้องลงเวลา
        </label>
        <label className="flex items-center gap-2">
          สิทธิ์
          <select name="role" className="input w-auto py-1" defaultValue={e?.role ?? "employee"} disabled={isSelf}>
            <option value="employee">พนักงาน</option>
            <option value="admin">ผู้ดูแลระบบ (HR)</option>
          </select>
          {isSelf && <input type="hidden" name="role" value="admin" />}
        </label>
      </div>

      {state?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Link href="/admin/employees" className="btn">ยกเลิก</Link>
        <SubmitButton>บันทึก</SubmitButton>
      </div>
    </form>
  );
}
