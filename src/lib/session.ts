import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { rpc, RpcError } from "./db";
import type { Me } from "./types";

const COOKIE = "lhr_session";

export async function getToken() {
  return (await cookies()).get(COOKIE)?.value;
}

/** Only callable from Server Actions / Route Handlers. */
export async function setToken(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearToken() {
  (await cookies()).delete(COOKIE);
}

export const getMe = cache(async (): Promise<Me | null> => {
  const token = await getToken();
  if (!token) return null;
  try {
    return await rpc<Me>("hr_me", { p_token: token });
  } catch (e) {
    if (e instanceof RpcError && e.code === "UNAUTHORIZED") return null;
    throw e;
  }
});

export async function requireMe(opts: { allowPinChange?: boolean } = {}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const pinFree = !me.settings.require_pin && me.employee.role === "employee";
  if (me.employee.must_change_pin && !pinFree && !opts.allowPinChange) redirect("/change-pin");
  return me;
}

/** For admin pages and actions: returns the token for admin RPC calls. */
export async function requireAdmin() {
  const me = await requireMe();
  if (me.employee.role !== "admin") redirect("/");
  const token = (await getToken())!;
  return { me, token };
}
