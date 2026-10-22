"use client";

import { useRouter } from "next/navigation";
import { SessionGate, useMe } from "@/components/session";
import { fullName } from "@/lib/format";
import { Brand } from "@/components/brand";
import { logout } from "@/lib/actions/auth";
import { ChangePinForm } from "./change-pin-form";

function Inner() {
  const me = useMe();
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <Brand sub="HR · หลังบ้าน" />
      <h1 className="mt-6 text-2xl font-semibold">ตั้ง PIN ของคุณ</h1>
      <p className="mt-1 text-sm text-muted">
        {fullName(me.employee)} · {me.employee.emp_code}
        {me.employee.must_change_pin && <><br />เข้าใช้ครั้งแรก กรุณาเปลี่ยน PIN เริ่มต้นเป็นของคุณเอง</>}
      </p>
      <div className="card mt-6 p-5">
        <ChangePinForm />
      </div>
      <button onClick={() => logout(router)} className="mt-4 text-center text-xs text-muted underline">ออกจากระบบ</button>
    </main>
  );
}

export default function ChangePinPage() {
  return (
    <SessionGate allowPinChange>
      <Inner />
    </SessionGate>
  );
}
