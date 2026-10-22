import { requireAdmin } from "@/lib/session";
import { rpc } from "@/lib/db";
import type { Settings } from "@/lib/types";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { token } = await requireAdmin();
  const s = await rpc<Settings>("hr_admin_settings", { p_token: token });
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">ตั้งค่า</p>
        <h1 className="h1">กติกาการลงเวลา</h1>
      </div>
      <SettingsForm s={s} />
    </div>
  );
}
