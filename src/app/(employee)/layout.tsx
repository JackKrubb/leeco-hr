import Link from "next/link";
import { requireMe } from "@/lib/session";
import { Brand } from "@/components/brand";
import { logoutAction } from "@/app/actions/auth";
import { NavLink } from "@/components/nav-link";

export default async function EmployeeLayout({ children }: LayoutProps<"/">) {
  const me = await requireMe();
  const e = me.employee;
  const showPin = me.settings.require_pin || e.role === "admin";
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <Link href="/"><Brand /></Link>
        <div className="flex items-center gap-2">
          {e.role === "admin" && <Link href="/admin" className="btn btn-sm">หลังบ้าน</Link>}
          <form action={logoutAction}>
            <button className="btn btn-sm">ออก</button>
          </form>
        </div>
      </header>
      <nav className={`mx-4 mb-4 grid ${showPin ? "grid-cols-3" : "grid-cols-2"} gap-1 rounded-xl border border-line bg-card p-1 text-sm`}>
        <NavLink href="/" exact>ลงเวลา</NavLink>
        <NavLink href="/calendar">ปฏิทิน</NavLink>
        {showPin && <NavLink href="/change-pin">เปลี่ยน PIN</NavLink>}
      </nav>
      <main className="flex-1 px-4 pb-10">{children}</main>
    </div>
  );
}
