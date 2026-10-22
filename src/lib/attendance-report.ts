import type { Attendance, Employee } from "./types";

export type AttendanceReport = {
  from: string;
  to: string;
  rows: { employee: Employee; attendance: Attendance }[];
  summary: {
    employee_id: string;
    emp_code: string;
    name: string;
    work_group: string | null;
    company: string | null;
    workdays: number;
    present: number;
    late_days: number;
    late_minutes: number;
    missing_checkout: number;
    early_days: number;
    early_minutes: number;
    break_late_days: number;
    break_late_minutes: number;
    break_early_days: number;
    break_early_minutes: number;
    missing_break: number;
    absent: number;
  }[];
};
