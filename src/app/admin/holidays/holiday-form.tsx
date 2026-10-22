"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveHolidayAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

export function HolidayForm() {
  const [state, action] = useActionState(saveHolidayAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">เพิ่มวันหยุดทีละวัน</h2>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr_150px]">
        <div><label className="label">วันที่</label><input name="holiday_date" type="date" className="input" required /></div>
        <div><label className="label">ชื่อวันหยุด</label><input name="name" className="input" placeholder="เช่น หยุดประจำปีบริษัท" required /></div>
        <div>
          <label className="label">ประเภท</label>
          <select name="type" className="input" defaultValue="company">
            <option value="company">วันหยุดบริษัท</option>
            <option value="public">วันหยุดราชการ</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div><label className="label">หมายเหตุ</label><input name="note" className="input" /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="company_off" defaultChecked /> บริษัทหยุด</label>
      </div>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.message && <p className="text-sm text-ok">{state.message}</p>}
      <div className="flex justify-end"><SubmitButton>เพิ่มวันหยุด</SubmitButton></div>
    </form>
  );
}
