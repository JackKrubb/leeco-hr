import type { ParseIssue } from "@/lib/excel/cells";

export function IssuesList({ issues }: { issues: ParseIssue[] }) {
  if (!issues.length) return null;
  const errors = issues.filter((i) => i.level === "error");
  return (
    <details open={errors.length > 0 || issues.length <= 8} className={`rounded-lg px-3 py-2 text-sm ${errors.length ? "bg-bad-soft" : "bg-warn-soft"}`}>
      <summary className={`cursor-pointer font-medium ${errors.length ? "text-bad" : "text-warn"}`}>
        {errors.length ? `พบปัญหา ${errors.length} รายการ` : `ข้อควรตรวจสอบ ${issues.length} รายการ`}
      </summary>
      <ul className="mt-1 space-y-0.5 text-xs">
        {issues.map((i, k) => (
          <li key={k}>{i.row > 0 && <span className="text-muted">แถว {i.row}: </span>}{i.message}</li>
        ))}
      </ul>
    </details>
  );
}
