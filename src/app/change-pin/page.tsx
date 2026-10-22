import { requireMe } from "@/lib/session";
import { fullName } from "@/lib/format";
import { Brand } from "@/components/brand";
import { logoutAction } from "@/app/actions/auth";
import { ChangePinForm } from "./change-pin-form";

export default async function ChangePinPage() {
  const me = await requireMe({ allowPinChange: true });
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <Brand />
      <h1 className="mt-6 text-2xl font-semibold">ตั้ง PIN ของคุณ</h1>
      <p className="mt-1 text-sm text-muted">
        {fullName(me.employee)} · {me.employee.emp_code}
        {me.employee.must_change_pin && <><br />เข้าใช้ครั้งแรก กรุณาเปลี่ยน PIN ที่ได้จาก HR เป็นของคุณเอง</>}
      </p>
      <div className="card mt-6 p-5">
        <ChangePinForm />
      </div>
      <form action={logoutAction} className="mt-4 text-center">
        <button className="text-xs text-muted underline">ออกจากระบบ</button>
      </form>
    </main>
  );
}
