import { authed, invalidate, messageOf } from "../api";
import type { ActionResult, Attendance } from "../types";

export type Loc = { lat: number; lng: number; accuracy: number } | null;

async function stamp(fn: "hr_check_in" | "hr_check_out", loc: Loc): Promise<ActionResult<Attendance>> {
  try {
    const data = await authed<Attendance>(fn, {
      p_lat: loc?.lat ?? null,
      p_lng: loc?.lng ?? null,
      p_accuracy: loc ? Math.round(loc.accuracy) : null,
    });
    invalidate();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

export const checkInAction = (loc: Loc) => stamp("hr_check_in", loc);
export const checkOutAction = (loc: Loc) => stamp("hr_check_out", loc);
