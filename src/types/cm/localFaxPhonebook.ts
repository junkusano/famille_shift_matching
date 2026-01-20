// =============================================================
// src/types/cm/localFaxPhonebook.ts
// ローカルFAX電話帳関連の型定義
// =============================================================

/**
 * ローカルFAX電話帳エントリ
 * テーブル: cm_local_fax_phonebook
 */
export type CmLocalFaxPhonebookEntry = {
  /** 内部ID */
  id: number;
  /** 事業所名 */
  name: string;
  /** 読み仮名 */
  name_kana: string | null;
  /** FAX番号（元の形式） */
  fax_number: string | null;
  /** FAX番号（正規化済み、ハイフンなし） */
  fax_number_normalized: string | null;
  /** XMLのprofile id */
  source_id: string | null;
  /** 備考 */
  notes: string | null;
  /** 有効フラグ */
  is_active: boolean;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
};

/**
 * データソース種別
 */
export type CmOfficeContactSource = 'kaipoke' | 'local_fax_phonebook';

/**
 * 統合ビューのレコード
 * ビュー: cm_office_contacts_view
 */
export type CmOfficeContact = {
  /** データソース（プログラム用） */
  source: CmOfficeContactSource;
  /** データソース（表示用） */
  source_label: string;
  /** カイポケ由来かどうか */
  is_from_kaipoke: boolean;
  /** ソースID */
  source_id: string | null;
  /** 事業所名 */
  name: string;
  /** 読み仮名 */
  name_kana: string | null;
  /** 電話番号 */
  phone: string | null;
  /** FAX番号 */
  fax_number: string | null;
  /** FAX番号（正規化済み） */
  fax_number_normalized: string | null;
  /** FAX送信先（代行番号があれば代行番号） */
  fax_send_to: string | null;
  /** サービス種別（カイポケのみ） */
  service_type: string | null;
  /** 事業者番号（カイポケのみ） */
  office_number: string | null;
  /** 住所（カイポケのみ） */
  address: string | null;
  /** 更新日時 */
  updated_at: string;
};

// =============================================================
// カイポケ連携表示用の型
// =============================================================

/**
 * カイポケ事業所情報（連携表示用）
 */
export type CmKaipokeOfficeInfo = {
  /** カイポケ事業所ID */
  id: number;
  /** 事業所名 */
  office_name: string;
  /** サービス種別 */
  service_type: string | null;
  /** 事業者番号 */
  office_number: string | null;
};

/**
 * カイポケ情報付きローカルFAX電話帳エントリ
 */
export type CmLocalFaxPhonebookEntryWithKaipoke = CmLocalFaxPhonebookEntry & {
  /** 同一FAX番号で登録されているカイポケ事業所 */
  kaipoke_offices: CmKaipokeOfficeInfo[];
};

/**
 * カイポケチェックAPIレスポンス
 */
export type CmKaipokeCheckResponse = {
  ok: boolean;
  offices?: CmKaipokeOfficeInfo[];
  error?: string;
};

// =============================================================
// API関連の型
// =============================================================

/**
 * ローカルFAX電話帳検索フィルター
 */
export type CmLocalFaxPhonebookFilters = {
  /** 事業所名（部分一致） */
  name: string;
  /** FAX番号（部分一致） */
  faxNumber: string;
  /** データソース */
  source: CmOfficeContactSource | '';
  /** カイポケ由来のみ */
  isFromKaipokeOnly: boolean;
};

/**
 * ローカルFAX電話帳検索フィルターのデフォルト値
 */
export const CM_LOCAL_FAX_PHONEBOOK_DEFAULT_FILTERS: CmLocalFaxPhonebookFilters = {
  name: '',
  faxNumber: '',
  source: '',
  isFromKaipokeOnly: false,
};

/**
 * ページネーション情報
 */
export type CmLocalFaxPhonebookPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * 統合連絡先一覧APIレスポンス
 */
export type CmOfficeContactsApiResponse = {
  ok: boolean;
  contacts?: CmOfficeContact[];
  pagination?: CmLocalFaxPhonebookPagination;
  error?: string;
};

/**
 * ローカルFAX電話帳エントリ更新リクエスト
 */
export type CmLocalFaxPhonebookEntryUpdateRequest = {
  name?: string;
  name_kana?: string;
  fax_number?: string;
  notes?: string;
  is_active?: boolean;
};

/**
 * ローカルFAX電話帳エントリ更新APIレスポンス
 */
export type CmLocalFaxPhonebookEntryUpdateResponse = {
  ok: boolean;
  entry?: CmLocalFaxPhonebookEntry;
  error?: string;
};

// =============================================================
// FAX番号-利用者紐付け関連の型
// =============================================================

/**
 * FAX番号と利用者の紐付け
 * テーブル: cm_fax_client_link
 * 
 * 用途:
 *   - カイポケに登録できない事業所（福祉用具、薬局など）
 *   - カイポケ登録前のお試し期間
 */
export type CmFaxClientLink = {
  /** 内部ID */
  id: number;
  /** FAX番号（正規化済み、ハイフンなし） */
  fax_number_normalized: string;
  /** 利用者ID */
  kaipoke_cs_id: string;
  /** 備考 */
  memo: string | null;
  /** 作成日時 */
  created_at: string;
  /** 作成者（user_id） */
  created_by: string | null;
};

/**
 * FAX-利用者紐付け作成リクエスト
 */
export type CmFaxClientLinkCreateRequest = {
  fax_number_normalized: string;
  kaipoke_cs_id: string;
  memo?: string;
};

/**
 * FAX-利用者紐付けAPIレスポンス
 */
export type CmFaxClientLinkApiResponse = {
  ok: boolean;
  links?: CmFaxClientLink[];
  error?: string;
};

/**
 * 利用者候補の取得元
 */
export type CmClientCandidateSource = 
  | 'kaipoke_service_usage'  // カイポケのサービス利用から
  | 'fax_client_link'        // 手動紐付けから
  | 'manual';                // 手動選択

/**
 * 利用者候補（取得元情報付き）
 */
export type CmClientCandidateWithSource = {
  kaipoke_cs_id: string;
  name: string;
  kana: string | null;
  source: CmClientCandidateSource;
  /** 紐付け元の事業所名（参考情報） */
  office_name?: string;
};

// =============================================================
// 同期関連の型
// =============================================================

/**
 * XMLからパースしたレコード
 */
export type CmLocalFaxPhonebookXmlRecord = {
  id: string;
  name: string;
  name_kana: string | null;
  fax_number: string | null;
  fax_normalized: string | null;
};

/**
 * 同期結果
 */
export type CmLocalFaxPhonebookSyncResult = {
  ok: boolean;
  summary: {
    /** XMLにのみ存在（DBに追加） */
    xmlOnly: number;
    /** DBにのみ存在（XMLに追加） */
    dbOnly: number;
    /** 内容差異あり */
    different: number;
    /** 処理時間（秒） */
    duration: number;
  };
  log: string[];
  error?: string;
};

// =============================================================
// GAS Web App API関連の型
// =============================================================

/**
 * GAS APIアクション
 */
export type CmPhonebookGasAction = 'sync' | 'add' | 'update' | 'delete';

/**
 * GAS API リクエスト（追加）
 */
export type CmPhonebookGasAddRequest = {
  action: 'add';
  name: string;
  name_kana?: string;
  fax_number?: string;
};

/**
 * GAS API リクエスト（更新）
 */
export type CmPhonebookGasUpdateRequest = {
  action: 'update';
  source_id: string;
  name?: string;
  name_kana?: string;
  fax_number?: string;
};

/**
 * GAS API リクエスト（削除）
 */
export type CmPhonebookGasDeleteRequest = {
  action: 'delete';
  source_id: string;
};

/**
 * GAS API リクエスト（同期）
 */
export type CmPhonebookGasSyncRequest = {
  action: 'sync';
};

/**
 * GAS API リクエスト
 */
export type CmPhonebookGasRequest =
  | CmPhonebookGasAddRequest
  | CmPhonebookGasUpdateRequest
  | CmPhonebookGasDeleteRequest
  | CmPhonebookGasSyncRequest;

/**
 * GAS API レスポンス（追加）
 */
export type CmPhonebookGasAddResponse = {
  ok: boolean;
  source_id?: string;
  name?: string;
  fax_number?: string;
  error?: string;
};

/**
 * GAS API レスポンス（更新・削除）
 */
export type CmPhonebookGasUpdateDeleteResponse = {
  ok: boolean;
  source_id?: string;
  error?: string;
};

/**
 * GAS API レスポンス（同期）
 */
export type CmPhonebookGasSyncResponse = CmLocalFaxPhonebookSyncResult;