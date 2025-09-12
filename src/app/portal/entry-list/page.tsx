'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';
import { getMapLinkFromZip } from '@/lib/getMapLinkFromZip';
import { getAddressFromZip } from '@/lib/getAddressFromZip';

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
  roster_sort?: string | null;
  user_id?: string | null;
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

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('form_entries_with_status')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to);

      if (error) {
        console.error('Supabase取得エラー:', error.message);
        setEntries([]);
      } else {
        const filtered = (data || []).filter((entry) => {
          if (role === 'admin') return true;
          return myLevelSort === null || (entry.level_sort ?? 999999) > myLevelSort;
        });

        const statusOrder: Record<string, number> = { account_id_create: 1, auth_mail_send: 2, joined: 3 };

        const sorted = filtered.sort((a, b) => {
          const sa = a.status === null ? -1 : statusOrder[a.status] ?? 99;
          const sb = b.status === null ? -1 : statusOrder[b.status] ?? 99;
          if (sa !== sb) return sa - sb;
          const la = a.level_sort ?? 0;
          const lb = b.level_sort ?? 0;
          return lb - la;
        });

        // ▼ usersテーブルから roster_sort / user_id を一括取得してマージ
        const entryIds = sorted.map(e => e.id);
        let rosterMap = new Map<string, { roster_sort: string | null; user_id: string | null }>();
        if (entryIds.length > 0) {
          const { data: usersRows, error: usersErr } = await supabase
            .from('users')
            .select('entry_id, user_id, roster_sort')
            .in('entry_id', entryIds);
          if (!usersErr && usersRows) {
            for (const r of usersRows) {
              rosterMap.set(r.entry_id, { roster_sort: r.roster_sort ?? null, user_id: r.user_id ?? null });
            }
          }
        }
        const merged = sorted.map(e => {
          const u = rosterMap.get(e.id);
          return { ...e, roster_sort: u?.roster_sort ?? null, user_id: u?.user_id ?? null };
        });
        setEntries(merged);
        setTotalCount(count || 0);
      }

      setLoading(false);
    };

    if (role === 'admin' || myLevelSort !== null) {
      fetchData();
    }
  }, [role, currentPage, myLevelSort]);

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
                <th className="border px-2 py-1" />
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
                    <td className="border px-2 py-1">{entry.status_label ?? '―'}</td>
                    <td className="border px-2 py-1">
                      <input
                        className="w-20 border rounded px-1 text-sm"
                        value={entry.roster_sort ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEntriesWithMap(prev => prev.map(p => p.id === entry.id ? { ...p, roster_sort: v } : p));
                        }}
                        onBlur={async (e) => {
                          const v = e.target.value || '9999';
                          // users.user_id が無い=まだ users 行未作成 → 更新不可なので警告のみ
                          if (!entry.user_id) {
                            alert('ユーザーID未作成のため更新できません（詳細画面でユーザーIDを作成してください）');
                            return;
                          }
                          const { error: upErr } = await supabase
                            .from('users')
                            .update({ roster_sort: v })
                            .eq('user_id', entry.user_id);
                          if (upErr) {
                            alert('roster_sort更新に失敗: ' + upErr.message);
                          } else {
                            setEntriesWithMap(prev => prev.map(p => p.id === entry.id ? { ...p, roster_sort: v } : p));
                          }
                        }}
                        placeholder="9999"
                      />
                    </td>
                    <td className="border px-2 py-1">{new Date(entry.created_at).toLocaleDateString()}</td>
                    <td className="border px-2 py-1">
                      <a
                        href={`/portal/entry-detail/${entry.id}`}
                        className="text-blue-600 underline hover:text-blue-800 text-sm"
                      >
                        詳細
                      </a>
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
