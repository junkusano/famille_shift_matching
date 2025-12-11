// src/lib/auto_assign_staff.ts
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

/**
 * 過去2か月で最も多くシフトに入っている人を
 * cs_kaipoke_info.asigned_jisseki_staff に自動設定する処理
 */
export async function autoAssignJissekiStaff() {
    const sql = `
WITH recent_shifts AS (
  SELECT
    s.kaipoke_cs_id,
    su.staff_user_id
  FROM shift s
  CROSS JOIN LATERAL (
    VALUES
      (s.staff_01_user_id, TRUE),
      (s.staff_02_user_id, s.staff_02_attend_flg),
      (s.staff_03_user_id, s.staff_03_attend_flg)
  ) AS su(staff_user_id, attend_flg)
  JOIN users u
    ON u.user_id = su.staff_user_id
  WHERE
    s.shift_start_date >= (CURRENT_DATE - INTERVAL '2 months')
    AND su.staff_user_id IS NOT NULL
    AND attend_flg
    AND COALESCE(u.status, '') <> 'removed_from_lineworks_kaipoke'
),

staff_counts AS (
  SELECT
    kaipoke_cs_id,
    staff_user_id,
    COUNT(*) AS shift_count,
    ROW_NUMBER() OVER (
      PARTITION BY kaipoke_cs_id
      ORDER BY COUNT(*) DESC, staff_user_id
    ) AS rn
  FROM recent_shifts
  GROUP BY kaipoke_cs_id, staff_user_id
),

best_staff AS (
  SELECT
    kaipoke_cs_id,
    staff_user_id
  FROM staff_counts
  WHERE rn = 1
), 

staff_with_org AS (
  SELECT
    b.kaipoke_cs_id,
    b.staff_user_id,
    COALESCE(e.orgunitid, u.org_unit_id::uuid) AS org_unit_id
  FROM best_staff b
  LEFT JOIN users u
    ON u.user_id = b.staff_user_id
  LEFT JOIN user_org_exception e
    ON e.user_id = b.staff_user_id
)

UPDATE cs_kaipoke_info c
SET
  asigned_jisseki_staff = s.staff_user_id,
  asigned_org = CASE
                  WHEN s.org_unit_id IS NOT NULL
                    THEN s.org_unit_id::uuid
                  ELSE c.asigned_org
                END
FROM staff_with_org s
WHERE c.kaipoke_cs_id = s.kaipoke_cs_id;

  `;

    const { error } = await supabase.rpc("exec_sql", { sql_text: sql });

    if (error) {
        console.error("[autoAssignJissekiStaff] ERROR:", error);
        throw error;
    }

    return { ok: true };
}
