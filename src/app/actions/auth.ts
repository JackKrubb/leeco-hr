"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rpc } from "@/lib/db";
import { errorMessage } from "@/lib/messages";
import { clearToken, getToken, setToken } from "@/lib/session";
import { actionError } from "@/lib/action-error";

export type FormState = { error?: string; message?: string } | undefined;

type LoginResult = {
  ok: boolean;
  error?: string;
  token?: string;
  role?: "employee" | "admin";
  must_change_pin?: boolean;
  attempts_left?: number;
};

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = String(fd.get("code") ?? "").trim();
  const pin = String(fd.get("pin") ?? "").trim();
  if (!code) return { error: "กรอกรหัสพนักงาน" };

  let res: LoginResult;
  try {
    const ua = (await headers()).get("user-agent") ?? null;
    res = await rpc<LoginResult>("hr_login", { p_code: code, p_pin: pin, p_user_agent: ua });
  } catch (e) {
    return { error: actionError(e).error };
  }
  if (!res.ok) {
    let msg = errorMessage(res.error ?? "INVALID_LOGIN");
    if (res.error === "INVALID_LOGIN" && res.attempts_left !== undefined && res.attempts_left <= 2) {
      msg += ` — ผิดได้อีก ${res.attempts_left} ครั้งก่อนถูกล็อก`;
    }
    return { error: msg };
  }
  await setToken(res.token!);
  redirect(res.must_change_pin ? "/change-pin" : res.role === "admin" ? "/admin" : "/");
}

export async function logoutAction() {
  const token = await getToken();
  if (token) {
    try {
      await rpc("hr_logout", { p_token: token });
    } catch {
      // the cookie is cleared either way
    }
  }
  await clearToken();
  redirect("/login");
}

export async function changePinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const oldPin = String(fd.get("old_pin") ?? "").trim();
  const newPin = String(fd.get("new_pin") ?? "").trim();
  const confirm = String(fd.get("confirm_pin") ?? "").trim();
  if (newPin !== confirm) return { error: "PIN ใหม่ทั้งสองช่องไม่ตรงกัน" };
  const token = await getToken();
  if (!token) redirect("/login");
  let res: { ok: boolean; error?: string };
  try {
    res = await rpc("hr_change_pin", { p_token: token, p_old: oldPin, p_new: newPin });
  } catch (e) {
    return { error: actionError(e).error };
  }
  if (!res.ok) return { error: errorMessage(res.error!) };
  redirect("/");
}
