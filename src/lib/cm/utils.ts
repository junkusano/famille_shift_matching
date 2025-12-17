// =============================================================
// src/lib/cm/utils.ts
// CM用ユーティリティ関数
// =============================================================

/**
 * 住所を結合して表示用文字列を生成
 */
export function cmFormatAddress(client: {
  prefecture?: string | null;
  city?: string | null;
  town?: string | null;
}): string {
  return [client.prefecture, client.city, client.town].filter(Boolean).join('');
}

/**
 * 和暦日付文字列を Date オブジェクトに変換
 * @param dateStr 和暦形式の日付（例: "令和3年10月1日"）または西暦形式
 * @returns Date オブジェクト（パース失敗時は null）
 */
export function cmParseJapaneseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  // 和暦パターン: 令和3年10月1日, 平成31年4月30日 など
  const japanesePattern = /^(明治|大正|昭和|平成|令和)(\d+)年(\d+)月(\d+)日$/;
  const match = dateStr.match(japanesePattern);

  if (match) {
    const era = match[1];
    const yearInEra = parseInt(match[2], 10);
    const month = parseInt(match[3], 10);
    const day = parseInt(match[4], 10);

    const eraStartYear: Record<string, number> = {
      '明治': 1868,
      '大正': 1912,
      '昭和': 1926,
      '平成': 1989,
      '令和': 2019,
    };

    const startYear = eraStartYear[era];
    if (!startYear) return null;

    const westernYear = startYear + yearInEra - 1;
    return new Date(westernYear, month - 1, day);
  }

  // 西暦パターン: YYYY-MM-DD or YYYY/MM/DD
  const westernStr = dateStr.replace(/\//g, '-');
  const parsed = new Date(westernStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 和暦の生年月日から年齢を計算
 * @param birthDateWareki 和暦形式の生年月日（例: "昭和7年4月24日"）
 * @returns 年齢（計算できない場合はnull）
 */
export function cmCalculateAge(birthDateWareki: string | null): number | null {
  if (!birthDateWareki) return null;

  const birthDate = cmParseJapaneseDate(birthDateWareki);
  if (!birthDate) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();

  // 誕生日がまだ来ていない場合は1歳引く
  const birthMonth = birthDate.getMonth();
  const birthDay = birthDate.getDate();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
    age--;
  }

  return age;
}

/**
 * 電話番号をフォーマット
 */
export function cmFormatPhone(phone: string | null): string {
  if (!phone) return '-';
  return phone;
}

/**
 * 日付をフォーマット（和暦 or ISO → 表示用）
 */
export function cmFormatDate(date: string | null): string {
  if (!date) return '-';
  return date;
}

/**
 * 要介護度に応じたTailwindクラスを返す
 */
export function cmGetCareLevelStyle(careLevel: string | null | undefined): string {
  if (!careLevel) return '';
  if (careLevel.includes('要介護')) return 'bg-orange-100 text-orange-700';
  if (careLevel.includes('要支援')) return 'bg-blue-100 text-blue-700';
  if (careLevel.includes('事業対象者')) return 'bg-green-100 text-green-700';
  return 'bg-slate-100 text-slate-600';
}

/**
 * 被保険者証が現在有効かどうかを判定
 */
export function cmIsInsuranceValid(insurance: {
  coverage_start: string;
  coverage_end: string;
}): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = cmParseJapaneseDate(insurance.coverage_start);
  const end = cmParseJapaneseDate(insurance.coverage_end);

  if (!start || !end) return false;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return today >= start && today <= end;
}

/**
 * 被保険者証情報を有効期間順にソート
 * 1. 現在有効なもの
 * 2. 将来有効なもの（開始日の早い順）
 * 3. 期限切れ（終了日の新しい順）
 */
export function cmSortInsurances<T extends {
  coverage_start: string;
  coverage_end: string;
}>(insurances: T[]): T[] {
  if (!insurances || insurances.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return [...insurances].sort((a, b) => {
    const aStart = cmParseJapaneseDate(a.coverage_start);
    const aEnd = cmParseJapaneseDate(a.coverage_end);
    const bStart = cmParseJapaneseDate(b.coverage_start);
    const bEnd = cmParseJapaneseDate(b.coverage_end);

    // パース失敗は後ろへ
    if (!aStart || !aEnd) return 1;
    if (!bStart || !bEnd) return -1;

    const aIsValid = today >= aStart && today <= aEnd;
    const bIsValid = today >= bStart && today <= bEnd;
    const aIsFuture = today < aStart;
    const bIsFuture = today < bStart;

    // 1. 現在有効なものを先頭に
    if (aIsValid && !bIsValid) return -1;
    if (!aIsValid && bIsValid) return 1;

    // 2. 将来有効なものを次に（開始日の早い順）
    if (aIsFuture && !bIsFuture) return -1;
    if (!aIsFuture && bIsFuture) return 1;
    if (aIsFuture && bIsFuture) {
      return aStart.getTime() - bStart.getTime();
    }

    // 3. 期限切れは終了日の新しい順
    return bEnd.getTime() - aEnd.getTime();
  });
}

/**
 * 被保険者証情報から現在有効なものを取得
 */
export function cmGetCurrentInsurance<T extends {
  coverage_start: string;
  coverage_end: string;
}>(insurances: T[]): {
  insurance: T | null;
  status: 'valid' | 'expired' | 'none';
} {
  if (!insurances || insurances.length === 0) {
    return { insurance: null, status: 'none' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const ins of insurances) {
    const start = cmParseJapaneseDate(ins.coverage_start);
    const end = cmParseJapaneseDate(ins.coverage_end);

    if (!start || !end) continue;

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (today >= start && today <= end) {
      return { insurance: ins, status: 'valid' };
    }
  }

  return { insurance: null, status: 'expired' };
}

/**
 * 介護度の表示情報を取得
 */
export function cmGetCareLevelDisplay<T extends {
  coverage_start: string;
  coverage_end: string;
  care_level?: string | null;
}>(insurances: T[]): {
  text: string;
  style: string;
} {
  const { insurance, status } = cmGetCurrentInsurance(insurances);

  if (status === 'none') {
    return { text: '未入力', style: 'bg-slate-100 text-slate-500' };
  }

  if (status === 'expired') {
    return { text: '有効期限切れ', style: 'bg-red-100 text-red-700' };
  }

  if (insurance?.care_level) {
    return {
      text: insurance.care_level,
      style: cmGetCareLevelStyle(insurance.care_level),
    };
  }

  return { text: '未入力', style: 'bg-slate-100 text-slate-500' };
}