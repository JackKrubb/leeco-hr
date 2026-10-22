import { rpc } from "./api";
import type { Holiday, Settings } from "./types";

const KEY = "lhr_kiosk";

export function getKioskKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setKioskKey(k: string) {
  try {
    localStorage.setItem(KEY, k);
  } catch {}
}

/** Picks up ?k=… from the kiosk link, stores it on this device and strips it from the address bar. */
export function absorbKioskKeyFromUrl() {
  const url = new URL(window.location.href);
  const k = url.searchParams.get("k");
  if (k) {
    setKioskKey(k);
    url.searchParams.delete("k");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
}

export type RosterPerson = {
  id: string;
  emp_code: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  nickname: string | null;
  work_group: string | null;
  position: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_minutes: number;
};

export type Roster = {
  today: string;
  server_time: string;
  is_workday: boolean;
  settings: Settings;
  holidays: Holiday[];
  employees: RosterPerson[];
};

export const loadRoster = (key: string) => rpc<Roster>("hr_kiosk_roster", { p_key: key });

export function kioskLink(key: string) {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/?k=${key}`;
}
