// The four daily stamps and the helpers both the kiosk and the reports use.
export type StampKind = "in" | "break_out" | "break_in" | "out";

export const STAMPS: { kind: StampKind; label: string; done: string; field: "check_in_at" | "break_out_at" | "break_in_at" | "check_out_at" }[] = [
  { kind: "in", label: "เข้างาน", done: "ลงเวลาเข้างานแล้ว", field: "check_in_at" },
  { kind: "break_out", label: "พักเที่ยง", done: "ตอกบัตรพักเที่ยงแล้ว", field: "break_out_at" },
  { kind: "break_in", label: "กลับจากพัก", done: "ตอกบัตรกลับจากพักแล้ว", field: "break_in_at" },
  { kind: "out", label: "ออกงาน", done: "ลงเวลาออกงานแล้ว", field: "check_out_at" },
];

type Times = { check_in_at: string | null; break_out_at: string | null; break_in_at: string | null; check_out_at: string | null };

/** Which stamps can be pressed now. */
export function allowed(t: Times): Record<StampKind, boolean> {
  return {
    in: !t.check_in_at,
    break_out: !!t.check_in_at && !t.break_out_at && !t.check_out_at,
    break_in: !!t.break_out_at && !t.break_in_at && !t.check_out_at,
    out: !!t.check_in_at && !t.check_out_at,
  };
}

/** The stamp the person most likely needs next. */
export function nextStamp(t: Times): StampKind | null {
  if (!t.check_in_at) return "in";
  if (t.check_out_at) return null;
  if (!t.break_out_at) return "break_out";
  if (!t.break_in_at) return "break_in";
  return "out";
}
