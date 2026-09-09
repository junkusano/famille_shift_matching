/**
 * cs_docs の利用者未設定判定は、利用者マスタとのJOIN結果ではなく業務キーで行う。
 * ブラウザ・サーバーの両方から安全に利用できるよう、Supabase依存を持たせない。
 */
export function isCsDocUserUnset(kaipokeCsId: string | null | undefined): boolean {
  return kaipokeCsId == null || kaipokeCsId === "";
}
