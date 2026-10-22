"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changePinAction } from "@/lib/actions/auth";
import { invalidate } from "@/lib/api";
import { SubmitButton } from "@/components/submit-button";

export function ChangePinForm() {
  const router = useRouter();
  const [state, action] = useActionState(changePinAction, undefined);
  useEffect(() => {
    if (state?.redirectTo) {
      invalidate();
      router.replace("/admin/");
    }
  }, [state, router]);
  const pinProps = { type: "password", inputMode: "numeric" as const, pattern: "[0-9]*", maxLength: 6, minLength: 4, required: true, className: "input text-base tracking-[0.4em]" };
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="old_pin">PIN ปัจจุบัน</label>
        <input id="old_pin" name="old_pin" autoComplete="current-password" {...pinProps} />
      </div>
      <div>
        <label className="label" htmlFor="new_pin">PIN ใหม่ (ตัวเลข 4–6 หลัก)</label>
        <input id="new_pin" name="new_pin" autoComplete="new-password" {...pinProps} />
      </div>
      <div>
        <label className="label" htmlFor="confirm_pin">ยืนยัน PIN ใหม่</label>
        <input id="confirm_pin" name="confirm_pin" autoComplete="new-password" {...pinProps} />
      </div>
      {state?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full py-3 text-base">บันทึก PIN ใหม่</SubmitButton>
    </form>
  );
}
