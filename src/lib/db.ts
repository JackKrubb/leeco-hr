import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set (see .env.example)");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** Error raised by an hr_* function, e.g. code "OUTSIDE_SITE", detail "412". */
export class RpcError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(code);
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    const [code, ...rest] = (error.message || "UNKNOWN").split(":");
    throw new RpcError(code.trim(), rest.join(":").trim() || undefined);
  }
  return data as T;
}
