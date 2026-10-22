export function Brand({ sub }: { sub?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-semibold tracking-[0.18em]">LEECO</span>
      <span className="text-sm text-muted">{sub ?? "HR"}</span>
    </div>
  );
}
