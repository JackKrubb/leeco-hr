export type Employee = {
  id: string;
  emp_code: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  nickname: string | null;
  work_group: string | null;
  department: string | null;
  position: string | null;
  company: string | null;
  start_date: string | null;
  note: string | null;
  sort_order: number | null;
  role: "employee" | "admin";
  track_attendance: boolean;
  active: boolean;
  must_change_pin: boolean;
  has_pin: boolean;
  locked: boolean;
};

export type Attendance = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  break_out_at: string | null;
  break_in_at: string | null;
  break_early_minutes: number;
  break_late_minutes: number;
  check_in_distance_m: number | null;
  check_out_distance_m: number | null;
  late_minutes: number;
  early_minutes: number;
  admin_note: string | null;
  edited_by: string | null;
};

export type Holiday = {
  id: string;
  holiday_date: string;
  name: string;
  type: "public" | "company";
  company_off: boolean;
  note: string | null;
};

export type Settings = {
  company_name: string;
  work_start: string;
  work_end: string;
  break_start: string;
  break_end: string;
  late_grace_minutes: number;
  work_days: number[];
  require_location: boolean;
  require_pin: boolean;
  site_lat?: number | null;
  site_lng?: number | null;
  site_radius_m: number;
  site_configured: boolean;
};

export type Me = {
  employee: Employee;
  server_time: string;
  settings: Settings;
  today: { date: string; is_workday: boolean; holidays: Holiday[]; attendance: Attendance | null };
  upcoming_holidays: Holiday[];
  recent: Attendance[];
};

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
