import { supabaseAdmin } from "@/lib/supabase/service";
import { OrgUnit } from "@/types/lineworks";

export async function saveOrgsMaster(orgUnits: OrgUnit[]) {
  if (!Array.isArray(orgUnits)) {
    throw new Error("orgUnits は配列である必要があります");
  }

  const formatted = orgUnits.map((org) => ({
    orgunitid: org.orgUnitId,
    orgunitname: org.orgUnitName,
    description: org.description ?? null,
    parentorgunitid: org.parentOrgUnitId ?? null,
    displayorder: org.displayOrder ?? null,
    displaylevel: org.displayLevel ?? null,
  }));

  const { error } = await supabaseAdmin
    .from("orgs")
    .upsert(formatted, { onConflict: "orgunitid" });

  if (error) {
    throw new Error(`orgs 同期失敗: ${error.message}`);
  }
}
