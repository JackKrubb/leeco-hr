"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children, variant = "pill" }: { href: string; exact?: boolean; children: React.ReactNode; variant?: "pill" | "side" }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  if (variant === "side") {
    return (
      <Link href={href} className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-ink text-white" : "text-ink hover:bg-paper"}`}>
        {children}
      </Link>
    );
  }
  return (
    <Link href={href} className={`rounded-lg px-3 py-2 text-center ${active ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
      {children}
    </Link>
  );
}
