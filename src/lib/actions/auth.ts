import { authed, clearToken, getToken, messageOf, rpc, setToken } from "../api";
import { errorMessage } from "../messages";

export type FormState = { error?: string; message?: string; redirectTo?: string } | undefined;

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
    res = await rpc<LoginResult>("hr_login", { p_code: code, p_pin: pin, p_user_agent: navigator.userAgent });
  } catch (e) {
    return { error: messageOf(e) };
  }
  if (!res.ok) {
    let msg = errorMessage(res.error ?? "INVALID_LOGIN");
    if (res.error === "INVALID_LOGIN" && res.attempts_left !== undefined && res.attempts_left <= 2) {
      msg += ` — ผิดได้อีก ${res.attempts_left} ครั้งก่อนถูกล็อก`;
    }
    return { error: msg };
  }
  setToken(res.token!);
  return { redirectTo: res.must_change_pin ? "/change-pin/" : res.role === "admin" ? "/admin/" : "/" };
}

export async function logout(router: { replace: (href: string) => void }) {
  const token = getToken();
  if (token) {
    try {
      await rpc("hr_logout", { p_token: token });
    } catch {
      // the local token is cleared either way
    }
  }
  clearToken();
  router.replace("/login/");
}

export async function changePinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const oldPin = String(fd.get("old_pin") ?? "").trim();
  const newPin = String(fd.get("new_pin") ?? "").trim();
  const confirm = String(fd.get("confirm_pin") ?? "").trim();
  if (newPin !== confirm) return { error: "PIN ใหม่ทั้งสองช่องไม่ตรงกัน" };
  try {
    const res = await authed<{ ok: boolean; error?: string }>("hr_change_pin", { p_old: oldPin, p_new: newPin });
    if (!res.ok) return { error: errorMessage(res.error!) };
  } catch (e) {
    return { error: messageOf(e) };
  }
  return { redirectTo: "/" };
}
