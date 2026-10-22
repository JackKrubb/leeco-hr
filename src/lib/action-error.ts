import { RpcError } from "./db";
import { errorMessage } from "./messages";

export function actionError(e: unknown): { ok: false; error: string } {
  // let Next.js redirects/notFound bubble up
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  if (e instanceof RpcError) return { ok: false, error: errorMessage(e.code, e.detail) };
  console.error(e);
  return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
}
