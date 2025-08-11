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
}

type AddrStatus = 'loading' | 'ok' | 'retry_fail';

// --- 郵便番号住所取得 with 再試行＆3桁フォールバック ---
const zipCache = new Map<string, { value: string; expires: number }>();

const prefix3Dict: Record<string, string> = {
  // 必要に応じて拡充してください
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

async function fetchAddressWithRetry(
  zip7: string,
  maxTry = 3
): Promise<{ text: string; status: 'ok' | 'hint' | 'retry_fail' }> {
  const now = Date.now();
  const cached = zipCache.get(zip7);
  if (cached && cached.expires > now) {
    return { text: cached.value, status: 'ok' };
  }

  let lastHint = getPrefixHint(zip7);

  for (let i = 0; i < maxTry; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000); // 4s timeout
    try {
      const addr = await getAddressFromZip(zip7);
      clearTimeout(timer);
      if (addr) {
        zipCache.set(zip7, { value: addr, expires: now + 7 * 24 * 60 * 60 * 1000 }); // 7日TTL
        return { text: addr, status: 'ok' };
      }
    } catch (_) {
      clearTimeout(timer);
      // 続行して再試行
    }
    // Exponential Backoff: 0.4s, 0.8s, 1.6s ...
    await new Promise((r) => setTimeout(r, 2 ** i * 400));
  }

  return { text: lastHint, status: 'retry_fail' };
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

  useEffect(() => {
    const fetchMyLevelSort = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        .order('created_at', { ascending: false }) // 登録日が新しい順
        .order('id', { ascending: true }) // 安定化のための第二キー
        .range(from, to);

      if (error) {
        console.error('Supabase取得エラー:', error.message);
        setEntries([]);
      } else {
        const filtered = (data || []).filter((entry) => {
          if (role === 'admin') return true;
          return myLevelSort === null || (entry.level_sort ?? 999999) > myLevelSort;
        });

        const statusOrder: Record<string, number> = {
          account_id_create: 1,
          auth_mail_send: 2,
          joined: 3,
        };

        const sorted = filtered.sort((a, b) => {
          const sa = a.status === null ? -1 : statusOrder[a.status] ?? 99;
          const sb = b.status === null ? -1 : statusOrder[b.status] ?? 99;
          if (sa !== sb) return sa - sb;
          const la = a.level_sort ?? 0;
          const lb = b.level_sort ?? 0;
          return lb - la;
        });

        setEntries(sorted);
        setTotalCount(count || 0);
      }

      setLoading(false);
    };

    if (role === 'admin' || myLevelSort !== null) {
      fetchData();
    }
  }, [role, currentPage, myLevelSort]);

  useEffect(() => {
    let cancelled = false;

    const addMapLinks = async () => {
      // 初期は loading の見た目に
      const initial = entries.map((e) => ({
        ...e,
        shortAddress: e.shortAddress ?? '検索中…',
        addrStatus: 'loading' as const,
      }));
      setEntriesWithMap(initial);

      const updated = await Promise.all(
        initial.map(async (entry) => {
          const zipcode = entry.postal_code?.toString().padStart(7, '0');
          let googleMapUrl: string | undefined = undefined;
          let shortAddress = entry.shortAddress ?? '検索中…';
          let addrStatus: AddrStatus = 'loading';

          if (zipcode && zipcode.length === 7) {
            // Mapリンクは番号だけでも生成（既存処理）
            googleMapUrl = await getMapLinkFromZip(zipcode);

            // 再試行つき取得
            const res = await fetchAddressWithRetry(zipcode);
            shortAddress = res.text;
            addrStatus = res.status === 'ok' ? 'ok' : 'retry_fail';
          } else {
            shortAddress = '郵便番号未設定';
            addrStatus = 'retry_fail';
          }

          return { ...entry, googleMapUrl, shortAddress, addrStatus };
        })
      );

      if (!cancelled) setEntriesWithMap(updated);
    };

    if (entries.length > 0) addMapLinks();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  if (!['admin', 'manager'].includes(role)) {
    return <p className="p-6">このページは管理者およびマネジャーのみがアクセスできます。</p>;
  }

  const filteredEntries = entriesWithMap.filter((entry) => {
    const fullName = `${entry.last_name_kanji}${entry.first_name_kanji}${entry.last_name_kana}${entry.first_name_kana}`;
    return fullName.includes(searchText) || entry.address.includes(searchText);
  });

  const totalPages = Math.ceil(totalCount / pageSize);

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
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((p) => p - 1)}
          className="px-3 py-1 border"
        >
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
