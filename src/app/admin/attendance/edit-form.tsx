"use client";

import { useActionState } from "react";
import { editAttendanceAction } from "@/lib/actions/admin";
import { SubmitButton } from "@/components/submit-button";

export function EditAttendanceForm({ employees, defaultDate }: { employees: { id: string; label: string }[]; defaultDate: string }) {
  const [state, action] = useActionState(editAttendanceAction, undefined);
  return (
    <form action={action} className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">แก้ไข / เพิ่มเวลาให้พนักงาน</h2>
        <p className="text-xs text-muted">ใช้กรณีลืมลงเวลา โทรศัพท์เสีย ฯลฯ — เว้นว่างทั้งเข้าและออก = ลบรายการของวันนั้น</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_110px_110px]">
        <div>
          <label className="label">พนักงาน</label>
          <select name="employee_id" className="input" required defaultValue="">
            <option value="" disabled>เลือก…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
        <div><label className="label">วันที่</label><input type="date" name="work_date" className="input" defaultValue={defaultDate} required /></div>
        <div><label className="label">เข้า</label><input type="time" name="check_in" className="input" /></div>
        <div><label className="label">ออก</label><input type="time" name="check_out" className="input" /></div>
      </div>
      <div><label className="label">เหตุผล (บันทึกไว้ในรายงาน)</label><input name="note" className="input" placeholder="เช่น ลืมลงเวลา หัวหน้าแผนกยืนยัน" required /></div>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.message && <p className="text-sm text-ok">{state.message}</p>}
      <div className="flex justify-end"><SubmitButton>บันทึกเวลา</SubmitButton></div>
    </form>
  );
}
