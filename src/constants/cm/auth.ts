// =============================================================
// src/constants/cm/auth.ts
// CM認証・認可関連の定数
// =============================================================

/**
 * CM側で許可される service_type
 *
 * - kyotaku: 居宅介護支援専用
 * - both: 居宅 + portal 両方
 *
 * requireCmSession（Server Actions用）と verifyRequest（API Route用）の
 * 両方で参照される。変更時は両方の認証に影響するため注意。
 */
export const CM_ALLOWED_SERVICE_TYPES = ["kyotaku", "both"] as const;
