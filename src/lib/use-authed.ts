"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { authed, clearToken, getVersion, messageOf, RpcError, subscribe } from "./api";

export type Loadable<T> = { data?: T; error?: string; loading: boolean };

/** Fetch an hr_* function with the user's token; refetches after invalidate(). */
export function useAuthed<T>(fn: string, args: Record<string, unknown> = {}, enabled = true): Loadable<T> {
  const router = useRouter();
  const version = useSyncExternalStore(subscribe, getVersion, () => 0);
  const key = JSON.stringify(args);
  const [state, setState] = useState<Loadable<T> & { key?: string }>({ loading: true });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    authed<T>(fn, JSON.parse(key))
      .then((data) => alive && setState({ data, loading: false, key }))
      .catch((e) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === "UNAUTHORIZED") {
          clearToken();
          router.replace("/login/");
          return;
        }
        setState({ error: messageOf(e), loading: false, key });
      });
    return () => {
      alive = false;
    };
  }, [fn, key, version, enabled, router]);

  // while the arguments changed and the new request is in flight, report loading
  if (state.key !== key) return { loading: true, data: state.data };
  return state;
}
