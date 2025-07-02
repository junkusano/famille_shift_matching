import { supabaseAdmin } from "@/lib/supabase/service";
import { User } from "@/types/lineworks";

export async function saveUsersLWTemp(users: User[]) {
  if (!Array.isArray(users)) {
    throw new Error("users は配列である必要があります");
  }

  const formatted = users.map((u) => ({
    user_id: u.userId,
    name: u.userName
      ? `${u.userName.lastName ?? ""}${u.userName.firstName ?? ""}`
      : u.nickName ?? "",
    organization: u.organizations?.[0]?.organizationName ?? "",
    org_unit: u.organizations?.[0]?.orgUnits?.[0]?.orgUnitName ?? "",
    position: u.organizations?.[0]?.orgUnits?.[0]?.positionName ?? "",
    level_code: u.organizations?.[0]?.levelCode ?? "",
    level_name: u.organizations?.[0]?.levelName ?? "",
  }));

  const { error } = await supabaseAdmin
    .from("users_lw_temp")
    .upsert(formatted, { onConflict: "user_id" });

  if (error) {
    throw new Error(`保存に失敗しました: ${error.message}`);
  }
}
