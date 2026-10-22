"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { useAuthed } from "@/lib/use-authed";
import { useClientValue } from "@/lib/use-client-value";
import type { Me } from "@/lib/types";

const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() outside <SessionGate>");
  return me;
}

export function isPinFree(me: Me) {
  return !me.settings.require_pin && me.employee.role === "employee";
}

export function Loading({ error }: { error?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-sm text-muted">
      {error ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">{error}</p> : <p>กำลังโหลด…</p>}
    </div>
  );
}

/** Loads the signed-in user (hr_me) and enforces login / admin / first-PIN rules. */
export function SessionGate({ admin = false, allowPinChange = false, children }: { admin?: boolean; allowPinChange?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const hasToken = useClientValue(() => !!getToken());

  useEffect(() => {
    if (hasToken === false) router.replace("/login/");
  }, [hasToken, router]);

  const me = useAuthed<Me>("hr_me", {}, hasToken === true);
  const e = me.data?.employee;
  const notAdmin = admin && e && e.role !== "admin";
  const mustChange = !!me.data && e!.must_change_pin && !isPinFree(me.data) && !allowPinChange;

  useEffect(() => {
    if (notAdmin) router.replace("/");
    else if (mustChange) router.replace("/change-pin/");
  }, [notAdmin, mustChange, router]);

  if (!me.data || notAdmin || mustChange) return <Loading error={me.error} />;
  return <MeContext.Provider value={me.data}>{children}</MeContext.Provider>;
}
