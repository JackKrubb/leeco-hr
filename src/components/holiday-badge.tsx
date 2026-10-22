import type { Holiday } from "@/lib/types";

export function HolidayBadge({ h }: { h: Pick<Holiday, "type" | "company_off"> }) {
  if (!h.company_off) return <span className="badge border border-line text-muted">ราชการ · บริษัททำงาน</span>;
  if (h.type === "company") return <span className="badge bg-company-soft text-company">วันหยุดบริษัท</span>;
  return <span className="badge bg-bad-soft text-public">วันหยุดราชการ</span>;
}
