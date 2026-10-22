"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authed, getToken } from "@/lib/api";
import type { Me } from "@/lib/types";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) return;
    authed<Me>("hr_me")
      .then((me) => me.employee.role === "admin" && router.replace("/admin/"))
      .catch(() => {});
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <Brand sub="HR · หลังบ้าน" />
        <h1 className="mt-6 text-2xl font-semibold">เข้าสู่ระบบหลังบ้าน</h1>
        <p className="mt-1 text-sm text-muted">สำหรับ HR และผู้ดูแลระบบ · พนักงานลงเวลาที่หน้าลงเวลาได้เลย ไม่ต้องเข้าสู่ระบบ</p>
      </div>
      <div className="card p-5">
        <LoginForm />
      </div>
      <Link href="/" className="mt-6 text-center text-xs text-muted underline">← กลับหน้าลงเวลา</Link>
    </main>
  );
}
