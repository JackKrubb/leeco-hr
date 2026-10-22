"use server";

import { revalidatePath } from "next/cache";
import { rpc } from "@/lib/db";
import { getToken } from "@/lib/session";
import { actionError } from "@/lib/action-error";
import type { ActionResult, Attendance } from "@/lib/types";

export type Loc = { lat: number; lng: number; accuracy: number } | null;

async function stamp(fn: "hr_check_in" | "hr_check_out", loc: Loc): Promise<ActionResult<Attendance>> {
  const token = await getToken();
  if (!token) return { ok: false, error: "หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่" };
  try {
    const data = await rpc<Attendance>(fn, {
      p_token: token,
      p_lat: loc?.lat ?? null,
      p_lng: loc?.lng ?? null,
      p_accuracy: loc ? Math.round(loc.accuracy) : null,
    });
    revalidatePath("/");
    return { ok: true, data };
  } catch (e) {
    return actionError(e);
  }
}

export async function checkInAction(loc: Loc) {
  return stamp("hr_check_in", loc);
}

export async function checkOutAction(loc: Loc) {
  return stamp("hr_check_out", loc);
}
