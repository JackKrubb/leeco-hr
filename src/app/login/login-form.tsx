"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const router = useRouter();
  const [state, action] = useActionState(loginAction, undefined);
  useEffect(() => {
    if (state?.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="code">รหัสผู้ใช้</label>
        <input id="code" name="code" className="input text-base uppercase" autoComplete="username" autoCapitalize="characters" placeholder="เช่น ADMIN" required />
      </div>
      <div>
        <label className="label" htmlFor="pin">PIN</label>
        <input id="pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} className="input text-base tracking-[0.4em]" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full py-3 text-base" pendingText="กำลังเข้าสู่ระบบ…">เข้าสู่ระบบ</SubmitButton>
    </form>
  );
}
