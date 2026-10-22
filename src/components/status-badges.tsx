import type { Attendance } from "@/lib/types";

/** Late / early / missing badges for one person-day. */
export function StatusBadges({ a, isWorkday, isPast, isToday }: { a: Attendance | null | undefined; isWorkday: boolean; isPast: boolean; isToday?: boolean }) {
  if (!a?.check_in_at) {
    if (!isWorkday) return <span className="badge bg-paper text-muted">วันหยุด</span>;
    return <span className="badge bg-bad-soft text-bad">{isPast ? "ขาด / ไม่ลงเวลา" : "ยังไม่เข้างาน"}</span>;
  }
  const out = [];
  if (a.late_minutes > 0) out.push(<span key="l" className="badge bg-warn-soft text-warn">สาย {a.late_minutes} น.</span>);
  if (a.break_early_minutes > 0) out.push(<span key="be" className="badge bg-early-soft text-early">ออกพักก่อน {a.break_early_minutes} น.</span>);
  if (a.break_late_minutes > 0) out.push(<span key="bl" className="badge bg-warn-soft text-warn">กลับจากพักสาย {a.break_late_minutes} น.</span>);
  if (a.early_minutes > 0) out.push(<span key="e" className="badge bg-early-soft text-early">กลับก่อน {a.early_minutes} น.</span>);
  if (!isToday && isWorkday && (!a.break_out_at || !a.break_in_at)) out.push(<span key="nb" className="badge bg-paper text-muted">ไม่ตอกพัก</span>);
  if (!a.check_out_at && !isToday) out.push(<span key="m" className="badge bg-paper text-muted">ไม่ลงเวลาออก</span>);
  if (!out.length) out.push(<span key="ok" className="badge bg-ok-soft text-ok">{a.check_out_at || !isToday ? "ปกติ" : "ตรงเวลา"}</span>);
  if (a.admin_note) out.push(<span key="n" className="badge border border-line text-muted" title={a.admin_note}>HR แก้ไข</span>);
  return <span className="inline-flex flex-wrap gap-1">{out}</span>;
}
