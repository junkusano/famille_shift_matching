import { supabaseAdmin } from "@/lib/supabase/service";
import { User } from "@/types/lineworks";

export async function saveUsersLWTemp(users: User[]) {
  if (!Array.isArray(users)) {
    throw new Error("users は配列である必要があります");
  }

  const formatted = users.map((u) => {
    const org = u.organizations?.[0];
    const orgUnit = org?.orgUnits?.[0];

    return {
      user_id: u.userId,
      user_external_key: u.userExternalKey,
      is_administrator: u.isAdministrator,
      is_pending: u.isPending,
      is_suspended: u.isSuspended,
      is_deleted: u.isDeleted,
      is_awaiting: u.isAwaiting,
      suspended_reason: u.suspendedReason,
      email: u.email,
      last_name: u.userName?.lastName ?? null,
      first_name: u.userName?.firstName ?? null,
      phonetic_last_name: u.userName?.phoneticLastName ?? null,
      phonetic_first_name: u.userName?.phoneticFirstName ?? null,
      nick_name: u.nickName,
      private_email: u.privateEmail,
      employment_type_id: u.employmentTypeId,
      employment_type_name: u.employmentTypeName,
      employment_type_external_key: u.employmentTypeExternalKey,
      user_type_id: u.userTypeId,
      user_type_name: u.userTypeName,
      user_type_external_key: u.userTypeExternalKey,
      user_type_code: u.userTypeCode,
      searchable: u.searchable,
      domain_id: org?.domainId ?? null,
      is_primary: org?.primary ?? null,
      org_email: org?.email ?? null,
      level_id: org?.levelId ?? null,
      level_external_key: org?.levelExternalKey ?? null,
      level_name: org?.levelName ?? null,
      executive: org?.executive ?? null,
      organization_name: org?.organizationName ?? null,
      org_unit_id: orgUnit?.orgUnitId ?? null,
      org_unit_name: orgUnit?.orgUnitName ?? null,
      org_unit_email: orgUnit?.orgUnitEmail ?? null,
      org_unit_primary: orgUnit?.primary ?? null,
      position_id: orgUnit?.positionId ?? null,
      position_name: orgUnit?.positionName ?? null,
      is_manager: orgUnit?.isManager ?? null,
      visible: orgUnit?.visible ?? null,
      use_team_feature: orgUnit?.useTeamFeature ?? null,
      telephone: u.telephone,
      cell_phone: u.cellPhone,
      location: u.location,
      task: u.task,
      messenger_protocol: u.messenger?.protocol ?? null,
      messenger_id: u.messenger?.messengerId ?? null,
      birthday_calendar_type: u.birthdayCalendarType,
      birthday: u.birthday,
      locale: u.locale,
      hired_date: u.hiredDate,
      time_zone: u.timeZone,
      loa_start_time: u.leaveOfAbsence?.startTime ?? null,
      loa_end_time: u.leaveOfAbsence?.endTime ?? null,
      is_leave_of_absence: u.leaveOfAbsence?.isLeaveOfAbsence ?? null,
      custom_fields: u.customFields ?? [],
      relations: u.relations ?? [],
      activation_date: u.activationDate,
      employee_number: u.employeeNumber,
    };
  });

  const { error } = await supabaseAdmin
    .from("users_lw_temp")
    .upsert(formatted, { onConflict: "user_id" });

  if (error) {
    throw new Error(`保存に失敗しました: ${error.message}`);
  }

  // users_lw_temp から users テーブルへ反映（lw_useridをキーに）
  const { error: updateError } = await supabaseAdmin.rpc("update_users_from_lw_temp");

  if (updateError) {
    throw new Error(`users テーブルの更新に失敗しました: ${updateError.message}`);
  }

}
