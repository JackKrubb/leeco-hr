"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SessionGate, useMe } from "@/components/session";
import { fullName } from "@/lib/format";
import { Brand } from "@/components/brand";
import { NavLink } from "@/components/nav-link";
import { logout } from "@/lib/actions/auth";

function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="no-print border-b border-line bg-card lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Link href="/admin/"><Brand sub="HR · หลังบ้าน" /></Link>
          <p className="hidden text-xs text-muted lg:mt-1 lg:block">{fullName(me.employee, false)}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible">
          <NavLink variant="side" href="/admin" exact>รายงานรายวัน</NavLink>
          <NavLink variant="side" href="/admin/reports/monthly">รายงานรายเดือน</NavLink>
          <NavLink variant="side" href="/admin/attendance">ช่วงวันที่ / แก้ไขเวลา</NavLink>
          <NavLink variant="side" href="/admin/employees">พนักงาน</NavLink>
          <NavLink variant="side" href="/admin/holidays">วันหยุด</NavLink>
          <NavLink variant="side" href="/admin/settings">ตั้งค่า / ลิงก์ลงเวลา</NavLink>
          <div className="hidden pt-4 lg:block" />
          <NavLink variant="side" href="/" exact>หน้าลงเวลา →</NavLink>
          <NavLink variant="side" href="/change-pin">เปลี่ยน PIN</NavLink>
          <button onClick={() => logout(router)} className="block w-full shrink-0 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap text-muted hover:bg-paper">ออกจากระบบ</button>
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate admin>
      <Shell>{children}</Shell>
    </SessionGate>
  );
}
