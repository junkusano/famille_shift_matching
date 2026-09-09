import { supabaseAdmin } from "@/lib/supabase/service";
import { OrgUnit } from "@/types/lineworks";

export async function saveOrgsLwTemp(orgUnits: OrgUnit[]) {
  if (!Array.isArray(orgUnits)) {
    throw new Error("orgUnits は配列である必要があります");
  }

  const formatted = orgUnits.map((org) => ({
    orgunitid: org.orgUnitId,
    orgunitexternalkey: org.orgUnitExternalKey ?? null,
    orgunitname: org.orgUnitName,
    email: org.email ?? null,
    description: org.description ?? null,
    visible: org.visible ?? true,
    parentorgunitid: org.parentOrgUnitId ?? null,
    parentexternalkey: org.parentExternalKey ?? null,
    displayorder: org.displayOrder ?? null,
    displaylevel: org.displayLevel ?? null,
    canreceiveexternalmail: org.canReceiveExternalMail ?? false,
    usemessage: org.useMessage ?? false,
    usenote: org.useNote ?? false,
    usecalendar: org.useCalendar ?? false,
    usetask: org.useTask ?? false,
    usefolder: org.useFolder ?? false,
    useservicenotification: org.useServiceNotification ?? false,
    aliasemails: org.aliasEmails ?? [],
    membersallowedtouseorgunitemailasrecipient:
      org.membersAllowedToUseOrgUnitEmailAsRecipient ?? [],
    membersallowedtouseorgunitemailassender:
      org.membersAllowedToUseOrgUnitEmailAsSender ?? [],
  }));

  const { error } = await supabaseAdmin
    .from("orgs_temp")
    .upsert(formatted, { onConflict: "orgunitid" });

  if (error) {
    throw new Error(`orgs_temp の保存に失敗しました: ${error.message}`);
  }
}
