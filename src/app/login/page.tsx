import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const me = await getMe();
  if (me) redirect(me.employee.role === "admin" ? "/admin" : "/");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <Brand />
        <h1 className="mt-6 text-2xl font-semibold">ลงเวลาทำงาน</h1>
        <p className="mt-1 text-sm text-muted">ใช้รหัสพนักงานและ PIN ที่ได้รับจาก HR</p>
      </div>
      <div className="card p-5">
        <LoginForm />
      </div>
      <p className="mt-6 text-center text-xs text-muted">ลืม PIN? แจ้ง HR เพื่อรีเซ็ต</p>
    </main>
  );
}
