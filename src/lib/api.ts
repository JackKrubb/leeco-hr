// Browser-side access to the hr_* database functions.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "./messages";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set (see .env.example)");
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

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    const [code, ...rest] = (error.message || "UNKNOWN").split(":");
    throw new RpcError(code.trim(), rest.join(":").trim() || undefined);
  }
  return data as T;
}

// ---------------------------------------------------------------- session token

const TOKEN_KEY = "lhr_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode etc. — the session just won't survive a reload
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Calls an hr_* function with the signed-in user's token. */
export function authed<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = getToken();
  if (!token) return Promise.reject(new RpcError("UNAUTHORIZED"));
  return rpc<T>(fn, { p_token: token, ...args });
}

/** Thai message for any thrown error. */
export function messageOf(e: unknown): string {
  if (e instanceof RpcError) return errorMessage(e.code, e.detail);
  if (e instanceof Error) return e.message;
  return "เกิดข้อผิดพลาด";
}

// ---------------------------------------------------------------- data refresh
// After a change, invalidate() makes every useAuthed() hook on screen refetch.

let version = 0;
const listeners = new Set<() => void>();

export function invalidate() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const getVersion = () => version;

/** Prefix a public file path with the site's base path. */
export const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
