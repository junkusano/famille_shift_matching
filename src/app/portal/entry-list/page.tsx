'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';
import { getMapLinkFromZip } from '@/lib/getMapLinkFromZip';
import { getAddressFromZip } from '@/lib/getAddressFromZip';
import Link from 'next/link';

interface EntryData {
  id: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  gender: string;
  created_at: string;
  auth_uid: string | null;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  postal_code?: string;
  address: string;
  shortAddress?: string;
  googleMapUrl?: string;
  status?: string;
  status_label?: string;
  level_label?: string;
  level_sort?: number;
  // 追加: usersテーブル由来
  user_id?: string | null;               // ★ 追加（users結合で使う）
  roster_sort?: string | null;           // ★ 追加（users.roster_sort）
}

type AddrStatus = 'loading' | 'ok' | 'retry_fail';

// ========================
//  1) 3桁ヒント辞書
// ========================
const prefix3Dict: Record<string, string> = {
  '060': '北海道（道央）',
  '100': '東京都（島しょ部）',
  '150': '東京都 渋谷区 周辺',
  '460': '愛知県 名古屋市周辺',
  '480': '愛知県 尾張小牧周辺',
  '486': '愛知県 春日井市周辺',
};

function getPrefixHint(zip7: string) {
  const p3 = zip7.slice(0, 3);
  return prefix3Dict[p3] ?? `〒${p3}*** 周辺`;
}

// ========================
//  2) 永続キャッシュ（localStorage）
//     形式: { [zip7]: { v: address, exp: epoch_ms } }
// ========================
const ZIP_CACHE_KEY = 'zipAddrCacheV1';
const ZIP_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7日

type LSCache = Record<string, { v: string; exp: number }>;

function readLS(): LSCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ZIP_CACHE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as LSCache;
    const now = Date.now();
    // 期限切れを掃除
    const cleaned: LSCache = {};
    for (const [k, val] of Object.entries(obj)) {
      if (val && typeof val.v === 'string' && typeof val.exp === 'number' && val.exp > now) {
        cleaned[k] = val;
      }
    }
    if (Object.keys(cleaned).length !== Object.keys(obj).length) {
      localStorage.setItem(ZIP_CACHE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeLS(next: LSCache) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(ZIP_CACHE_KEY, JSON.stringify(next)); } catch { /* noop */ }
}

function getFromCache(zip7: string): string | null {
  const store = readLS();
  const hit = store[zip7];
  if (hit && hit.exp > Date.now()) return hit.v;
  return null;
}

function setToCache(zip7: string, addr: string) {
  const store = readLS();
  store[zip7] = { v: addr, exp: Date.now() + ZIP_CACHE_TTL };
  writeLS(store);
}

// ========================
//  3) 再試行付き取得（永続キャッシュ + 3桁ヒント）
// ========================
async function fetchAddressWithRetry(
  zip7: string,
  maxTry = 3
): Promise<{ text: string; status: 'ok' | 'hint' | 'retry_fail' }> {
  const cached = getFromCache(zip7);
  if (cached) {
    return { text: cached, status: 'ok' };
  }

  const lastHint = getPrefixHint(zip7);

  for (let i = 0; i < maxTry; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000); // 4s timeout
    try {
      const addr = await getAddressFromZip(zip7);
      clearTimeout(timer);
      if (addr) {
        setToCache(zip7, addr);
        return { text: addr, status: 'ok' };
      }
    } catch {
      clearTimeout(timer);
    }
    // Exponential Backoff: 0.4s, 0.8s, 1.6s ...
    await new Promise((r) => setTimeout(r, 2 ** i * 400));
  }

  return { text: lastHint, status: 'retry_fail' };
}

// ========================
//  4) 並列数制限ユーティリティ
// ========================
async function processInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

export default function EntryListPage() {
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [entriesWithMap, setEntriesWithMap] = useState<(EntryData & { addrStatus?: AddrStatus })[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [myLevelSort, setMyLevelSort] = useState<number | null>(null);
  const pageSize = 50;
  const role = useUserRole();

  // ★ コンポーネント関数の中へ（例: export default function Page() { の直下あたり）
  const [rosterEdits, setRosterEdits] = useState<Record<string, string>>({});

  // 保存ボタンの行ごとの状態: idle/saving/ok/err
  const [rowSaveState, setRowSaveState] = useState<Record<string, 'idle' | 'saving' | 'ok' | 'err'>>({});
  // ステータス候補（表示ラベルと並び順も使用）
  const [statusMaster, setStatusMaster] = useState<{ id: string; label: string | null; sort_order: number }[]>([]);
  // 追加：未保存の選択値（行単位で貯める）
  const [statusEdits, setStatusEdits] = useState<Record<string, string>>({});

  // ▼ 権限・並び替え同等（元のまま）
  useEffect(() => {
    const fetchMyLevelSort = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRecord } = await supabase
        .from('users')
        .select('level_id')
        .eq('auth_user_id', user.id)
        .single();

      if (!userRecord?.level_id) return;

      const { data: levelRecord } = await supabase
        .from('levels')
        .select('sort_order')
        .eq('id', userRecord.level_id)
        .single();

      if (levelRecord?.sort_order !== undefined) {
        setMyLevelSort(levelRecord.sort_order);
      }
    };

    fetchMyLevelSort();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!['admin', 'manager'].includes(role)) {
        setLoading(false);
        return;
      }

      const start = (currentPage - 1) * pageSize;

      const { data: rawEntries, error: e1 } = await supabase
        .from('form_entries_with_status')
        .select('*'); // { count: 'exact' } は不要（後で length を使う

      if (e1) {
        console.error('Supabase取得エラー:', e1.message);
        setEntries([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }


      // 2) 権限に応じたフィルタ
      const filtered = (rawEntries ?? []).filter((entry) => {
        if (role === 'admin') return true;
        return myLevelSort === null || (entry.level_sort ?? 999999) > myLevelSort;
      });

      // 3) users をマージ（auth_user_id も取得して「未認証」判定に使う）
      const entryIds = filtered.map(e => e.id);
      const userMap = new Map<string, { roster_sort: string | null; user_id: string | null; auth_user_id: string | null }>();
      if (entryIds.length > 0) {
        const { data: usersRows } = await supabase
          .from('users')
          .select('entry_id, user_id, roster_sort, auth_user_id')
          .in('entry_id', entryIds);
        for (const r of (usersRows ?? [])) {
          userMap.set(r.entry_id, {
            roster_sort: r.roster_sort ?? null,
            user_id: r.user_id ?? null,
            auth_user_id: r.auth_user_id ?? null,
          });
        }
      }

      const merged = filtered.map(e => {
        const u = userMap.get(e.id);
        return {
          ...e,
          roster_sort: u?.roster_sort ?? null,
          user_id: u?.user_id ?? null,
          auth_user_id: u?.auth_user_id ?? null,
        };
      });

      // 4) 全体ソート：未認証 → ステータス → level_sort → roster_sort（すべて昇順）
      //   未認証の定義：auth_user_id が無い or status !== 'auth_completed'
      const statusOrderMap = new Map(statusMaster.map(s => [s.id, s.sort_order]));
      const asNum = (v: string | null | undefined) => {
        const n = parseInt(v ?? '', 10);
        return Number.isFinite(n) ? n : 9999;
      };
      // ステータス未設定を最優先（emailやauth_user_idは並び順に関与させない）
      const isStatusMissing = (row: { status?: string | null }) =>
        !row.status || String(row.status).trim() === '';

      const sortedAll = [...merged].sort((a, b) => {
        // ① ステータス未設定を先頭
        const ma = isStatusMissing(a) ? 0 : 1;
        const mb = isStatusMissing(b) ? 0 : 1;
        if (ma !== mb) return ma - mb;

        // ② ステータスのsort_order（昇順）
        const sa = a.status ? (statusOrderMap.get(a.status) ?? 9999) : 9999;
        const sb = b.status ? (statusOrderMap.get(b.status) ?? 9999) : 9999;
        if (sa !== sb) return sa - sb;

        // ③ 職級 level_sort（昇順）
        const la = a.level_sort ?? 9999;
        const lb = b.level_sort ?? 9999;
        if (la !== lb) return la - lb;

        // ④ roster_sort（数値化の昇順）
        return asNum(a.roster_sort) - asNum(b.roster_sort);
      });

      // 5) 最後にページ分割（全体ソート後に slice）
      const pageRows = sortedAll.slice(start, start + pageSize);

      setEntries(pageRows);
      setTotalCount(sortedAll.length);
      setLoading(false);
    };

    if (role === 'admin' || myLevelSort !== null) {
      fetchData();
    }
  }, [role, currentPage, myLevelSort, statusMaster]); // ステータス並び順のために依存追加

  // ② ステータスマスター取得（activeのみ）
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('user_status_master')
        .select('id,label,active,sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (!error) {
        const rows = (data ?? []) as Array<{ id: string; label: string | null; sort_order: number | null }>;
        setStatusMaster(rows.map(({ id, label, sort_order }) => ({
          id, label, sort_order: sort_order ?? 9999
        })));
      }
    })();
  }, []);

  // ▼ 住所解決：即時ヒント表示 + 並列制限 + ストリーミング更新
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (entries.length === 0) return;

      // 1) まず即時ヒントで描画（検索中…ではなく）
      const initial = entries.map((e) => {
        const zipcode = e.postal_code?.toString().padStart(7, '0');
        const hint = zipcode && zipcode.length === 7 ? getPrefixHint(zipcode) : '郵便番号未設定';
        return { ...e, shortAddress: hint, addrStatus: 'loading' as const };
      });
      setEntriesWithMap(initial);

      // 2) バッチで解決して、行ごとにストリーミング反映
      const byId = new Map(initial.map((it) => [it.id, it]));
      void byId;

      await processInBatches(initial, 6, async (entry) => {
        if (cancelled) return;
        const zipcode = entry.postal_code?.toString().padStart(7, '0');
        if (!zipcode || zipcode.length !== 7) {
          // 郵便番号なし
          setEntriesWithMap((prev) => prev.map((p) => (p.id === entry.id ? { ...p, addrStatus: 'retry_fail' } : p)));
          return;
        }

        // Map URL はすぐ用意
        const gmap = await getMapLinkFromZip(zipcode);
        const res = await fetchAddressWithRetry(zipcode);

        // 最新のエントリに反映
        setEntriesWithMap((prev) => prev.map((p) => {
          if (p.id !== entry.id) return p;
          return {
            ...p,
            googleMapUrl: gmap,
            shortAddress: res.text,
            addrStatus: res.status === 'ok' ? 'ok' : 'retry_fail',
          };
        }));
      });
    };

    run();
    return () => { cancelled = true; };
  }, [entries]);

  if (!['admin', 'manager'].includes(role)) {
    return <p className="p-6">このページは管理者およびマネジャーのみがアクセスできます。</p>;
  }

  const filteredEntries = entriesWithMap.filter((entry) => {
    const fullName = `${entry.last_name_kanji}${entry.first_name_kanji}${entry.last_name_kana}${entry.first_name_kana}`;
    return fullName.includes(searchText) || entry.address.includes(searchText);
  });

  return (
    <div className="content">
      <h2 className="text-xl font-bold mb-4">全エントリー一覧</h2>

      <input
        type="text"
        placeholder="名前・住所で検索"
        className="mb-4 p-2 border"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />

      {loading ? (
        <p>読み込み中...</p>
      ) : entriesWithMap.length === 0 ? (
        <p>該当するエントリーはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border px-2 py-1">氏名</th>
                <th className="border px-2 py-1">性別</th>
                <th className="border px-2 py-1">年齢</th>
                <th className="border px-2 py-1">住所</th>
                <th className="border px-2 py-1">職級</th>
                <th className="border px-2 py-1">ステータス</th>
                <th className="border px-2 py-1">並び順(roster)</th>
                <th className="border px-2 py-1">登録日</th>
                <th className="border px-2 py-1">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const age =
                  new Date().getFullYear() - entry.birth_year -
                  (new Date().getMonth() + 1 < entry.birth_month ||
                    (new Date().getMonth() + 1 === entry.birth_month && new Date().getDate() < entry.birth_day)
                    ? 1
                    : 0);

                // 行単位の変更検知（実際に後で使用する）
                const rosterChanged =
                  (rosterEdits[entry.id] ?? (entry.roster_sort ?? '')) !== (entry.roster_sort ?? '');
                const statusChanged =
                  (statusEdits[entry.id] ?? (entry.status ?? '')) !== (entry.status ?? '');

                return (
                  <tr key={entry.id}>
                    <td className="border px-2 py-1">
                      <span className="text-sm text-gray-500">
                        {entry.last_name_kana} {entry.first_name_kana}
                      </span>
                      <br />
                      {entry.last_name_kanji} {entry.first_name_kanji}
                    </td>
                    <td className="border px-2 py-1">{entry.gender ?? '―'}</td>
                    <td className="border px-2 py-1">{isNaN(age) ? '―' : `${age}歳`}</td>
                    <td className="border px-2 py-1">
                      <div className="flex items-center gap-2">
                        <a
                          href={entry.googleMapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline"
                          title="Googleマップを開く"
                        >
                          {entry.shortAddress || '検索中…'}
                        </a>
                        {entry.addrStatus === 'loading' && (
                          <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded">取得中</span>
                        )}
                        {entry.addrStatus === 'retry_fail' && (
                          <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded">再試行中/候補</span>
                        )}
                      </div>
                    </td>
                    <td className="border px-2 py-1">{entry.level_label ?? '―'}</td>
                    <td className="border px-2 py-1">
                      <select
                        className="border rounded px-1 text-sm"
                        value={statusEdits[entry.id] ?? (entry.status ?? '')}
                        disabled={!entry.user_id || statusMaster.length === 0}
                        onChange={(e) => {
                          const v = e.target.value; // 未保存バッファに格納
                          setStatusEdits(prev => ({ ...prev, [entry.id]: v }));
                        }}
                      >
                        <option value="">—</option>
                        {statusMaster.map(s => (
                          <option key={s.id} value={s.id}>{s.label ?? s.id}</option>
                        ))}
                      </select>
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        className="w-20 border rounded px-1 text-sm"
                        value={rosterEdits[entry.id] ?? (entry.roster_sort ?? '')}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRosterEdits(prev => ({ ...prev, [entry.id]: v }));
                        }}
                        placeholder="9999"
                        disabled={!entry.user_id}
                        title={!entry.user_id ? 'ユーザー未作成のため編集不可（詳細画面でユーザーIDを作成）' : ''}

                      />
                    </td>
                    <td className="border px-2 py-1">{new Date(entry.created_at).toLocaleDateString()}</td>
                    <td className="border px-2 py-1">
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50"
                          disabled={!entry.user_id || (!rosterChanged && !statusChanged)}
                          onClick={async () => {
                            if (!entry.user_id) {
                              alert('ユーザー未作成のため保存できません。詳細画面でユーザーIDを生成してください。');
                              return;
                            }
                            setRowSaveState(prev => ({ ...prev, [entry.id]: 'saving' }));
                            const nextRoster = (rosterEdits[entry.id] ?? entry.roster_sort ?? '').trim() || '9999';
                            const nextStatus = statusEdits[entry.id] ?? (entry.status ?? '');

                            // 変化があるものだけ送る
                            const payload: Record<string, unknown> = {};
                            if (nextRoster !== (entry.roster_sort ?? '')) payload.roster_sort = nextRoster;
                            if (nextStatus !== (entry.status ?? '')) payload.status = nextStatus || null;

                            if (Object.keys(payload).length === 0) {
                              setRowSaveState(prev => ({ ...prev, [entry.id]: 'idle' }));
                              alert('変更はありません');
                              return;
                            }

                            const { error } = await supabase.from('users').update(payload).eq('user_id', entry.user_id);

                            if (error) {
                              setRowSaveState(prev => ({ ...prev, [entry.id]: 'err' }));
                              alert('保存に失敗：' + error.message);
                              return;
                            }
                            // 画面反映
                            const statusLabel = statusMaster.find(s => s.id === nextStatus)?.label ?? null;
                            setEntries(prev => {
                              const updated = prev.map(p => p.id === entry.id ? {
                                ...p,
                                roster_sort: payload.roster_sort ? String(nextRoster) : p.roster_sort,
                                status: payload.status ? (nextStatus || undefined) : p.status,
                                status_label: payload.status ? (statusLabel ?? undefined) : p.status_label,
                              } : p);
                              // 保存後も指定の優先度で再ソート
                              const orderMap = new Map(statusMaster.map(s => [s.id, s.sort_order]));
                              const asNum = (v: string | null | undefined) => {
                                const n = parseInt(v ?? '', 10); return Number.isFinite(n) ? n : 9999;
                              };
                              return [...updated].sort((a, b) => {
                                const isMissing = (row: { status?: string | null }) =>
                                  !row.status || String(row.status).trim() === '';
                                // ① ステータス未設定
                                const ma = isMissing(a) ? 0 : 1;
                                const mb = isMissing(b) ? 0 : 1;
                                if (ma !== mb) return ma - mb;
                                // ② ステータスsort_order
                                const sa = a.status ? (orderMap.get(a.status) ?? 9999) : 9999;
                                const sb = b.status ? (orderMap.get(b.status) ?? 9999) : 9999;
                                if (sa !== sb) return sa - sb;
                                // ③ 職級
                                const la = a.level_sort ?? 9999;
                                const lb = b.level_sort ?? 9999;
                                if (la !== lb) return la - lb;
                                // ④ roster
                                return asNum(a.roster_sort) - asNum(b.roster_sort);
                              });
                            });
                            // 未保存バッファのクリア
                            setRosterEdits(prev => {
                              const next = { ...prev };
                              delete next[entry.id];
                              return next;
                            });
                            setStatusEdits(prev => {
                              const next = { ...prev };
                              delete next[entry.id];
                              return next;
                            });
                            setRowSaveState(prev => ({ ...prev, [entry.id]: 'ok' }));
                            setTimeout(() =>
                              setRowSaveState(prev => ({ ...prev, [entry.id]: 'idle' }))
                              , 1200);
                            alert('保存しました');
                          }}
                        >
                          {rowSaveState[entry.id] === 'saving' ? '保存中…'
                            : rowSaveState[entry.id] === 'ok' ? '保存済'
                              : '保存'}
                        </button>
                        {rowSaveState[entry.id] === 'ok' && (
                          <span className="text-xs text-green-600">保存しました</span>
                        )}
                        <Link href={`/portal/entry-detail/${entry.id}`}>
                          <button className="px-3 py-1 bg-blue-600 text-white rounded">詳細</button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center mt-4">
        <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)} className="px-3 py-1 border">
          ◀ 前へ
        </button>
        <span>
          {currentPage} / {Math.ceil(totalCount / pageSize)}
        </span>
        <button
          disabled={currentPage === Math.ceil(totalCount / pageSize)}
          onClick={() => setCurrentPage((p) => p + 1)}
          className="px-3 py-1 border"
        >
          次へ ▶
        </button>
      </div>
    </div>
  );
}
