"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Reads a browser-only value (localStorage, URL) after hydration without a setState-in-effect. */
export function useClientValue<T>(read: () => T): T | undefined {
  return useSyncExternalStore(noop, read, () => undefined);
}
