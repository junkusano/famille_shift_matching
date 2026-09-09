// ファイル設置場所：
// src/lib/lineworks/groupDefaults.ts
// 用途：グループ作成時の固定マスター・マネージャーグループ定義などを集約

// 固定マスター（人事労務サポート・キャリア調整ルーム）
export const FIXED_GROUP_MASTERS = [
  "junkusano",       // 草野淳（代表）
  "shinomasuda",     // 増田志乃（代表代理）
  "ryotashinkawa",   // 新川良太（採用マネジャー）
  "satominishio"     // 西尾里美（総務アシスタント）
];

// 勤務キャリア・コーディネートルーム用マネジャーグループ（LINE WORKS 内グループID）
// ※Supabaseまたは環境変数から取得でもOK（ここでは固定値で記述）
export const HELPER_MANAGER_GROUP_ID = "a0c7708a-04c3-47a1-399b-05ddcb9eda31";

// 上位レベルの職員を取得するための条件レベル値（例：自分のsort_orderより小さい＝上位）
export const LEVEL_SORT_THRESHOLD = (currentSort: number) => currentSort - 1;

// 組織の親を再帰的に辿る上限回数（無限ループ防止）
export const ORG_RECURSION_LIMIT = 10;
