'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
import Link from 'next/link';
import { addStaffLog } from '@/lib/addStaffLog';
import hepburn from 'hepburn';

interface Attachment {
    url: string | null;
    type?: string;
    label?: string;
    mimeType?: string | null;
}

interface EntryDetail {
    id: string;
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    gender: string;
    birth_year: number;
    birth_month: number;
    birth_day: number;
    address: string;
    postal_code: string;
    phone: string;
    email: string;
    motivation: string;
    work_styles: string[];
    workstyle_other: string;
    commute_options?: string[];
    health_condition: string;
    photo_url?: string;
    attachments?: Attachment[];
    created_at: string;
    consent_snapshot: string;
    manager_note: string;
}

interface StaffLog {
    id: number;
    staff_id: string;
    action_at: string;
    action_detail: string;
    registered_by: string;
    created_at: string;
}

interface UserRecord {
    user_id: string;
    email: string;
    auth_user_id?: string | null;
}

type NameInfo = {
    firstKana: string;
    lastKana: string;
};

export default function EntryDetailPage() {
    const { id } = useParams();
    const [entry, setEntry] = useState<EntryDetail | null>(null);
    const [managerNote, setManagerNote] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);
    const [noteMsg, setNoteMsg] = useState<string | null>(null);

    const [userId, setUserId] = useState('');
    const [userIdLoading, setUserIdLoading] = useState(false);
    const [existingIds, setExistingIds] = useState<string[]>([]);
    const [userIdSuggestions, setUserIdSuggestions] = useState<string[]>([]);
    const [userRecord, setUserRecord] = useState<UserRecord | null>(null);

    const fetchExistingIds = async () => {
        const { data } = await supabase.from('users').select('user_id');
        setExistingIds(data?.map((row: { user_id: string }) => row.user_id) ?? []);
    };

    useEffect(() => {
        fetchExistingIds();
    }, []);

    useEffect(() => {
        const fetchEntry = async () => {
            const { data, error } = await supabase
                .from('form_entries')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error('取得エラー:', error.message);
            } else {
                setEntry(data);
                setManagerNote(data?.manager_note ?? '');
            }
        };

        if (id) fetchEntry();
    }, [id]);

    useEffect(() => {
        if (entry && existingIds.length) {
            const nameInfo = {
                firstKana: entry.first_name_kana,
                lastKana: entry.last_name_kana,
            };
            const suggestions = getUserIdSuggestions(nameInfo, existingIds);
            setUserIdSuggestions(suggestions);
            if (suggestions.length > 0) setUserId(suggestions[0]);
        }
    }, [entry, existingIds]);


    const fetchUserRecord = useCallback(async () => {
        if (!entry?.id) return;
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('entry_id', entry.id)
            .single();

        if (!error && data) {
            setUserRecord(data);
            setUserId(data.user_id);  // DBにあるIDをそのまま使う
        } else {
            setUserRecord(null);
        }
    }, [entry?.id]);

    useEffect(() => {
        if (entry) {
            fetchUserRecord();
        }
    }, [entry, fetchUserRecord]);

    useEffect(() => {
        if (entry && !userRecord && existingIds.length) {
            const nameInfo = {
                firstKana: entry.first_name_kana,
                lastKana: entry.last_name_kana,
            };
            const suggestions = getUserIdSuggestions(nameInfo, existingIds);
            setUserIdSuggestions(suggestions);
            if (suggestions.length > 0) setUserId(suggestions[0]);
        }
    }, [entry, userRecord, existingIds]);


    const handleAccountCreate = async () => {
        if (existingIds.includes(userId)) {
            alert('このアカウントIDは既に存在します。別のIDを入力してください。');
            return;
        }

        setUserIdLoading(true);

        const { error } = await supabase.from('users').insert({
            user_id: userId,
            system_role: 'member',
            entry_id: entry?.id,
            status: 'account_id_create',  // アカウントID作成済の状態
        });

        setUserIdLoading(false);

        if (!error) {
            alert('アカウントを作成しました');
            await fetchExistingIds();  // 登録後の最新状態を反映
        } else {
            alert('エラーが発生しました：' + (error.message || ''));
        }
    };


    const handleSendInvite = async () => {
        const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('user_id')
            .eq('user_id', userId)
            .single();

        if (usersError || !usersData) {
            alert('アカウントIDが未登録のため、認証メールは送信できません。先にアカウント発行を行ってください。');
            return;
        }

        if (!entry?.email) {
            alert('メールアドレスがありません');
            return;
        }

        const password = Math.random().toString(36).slice(-8) + 'Aa1!';
        const { data, error } = await supabase.auth.signUp({
            email: entry.email,
            password,
            options: {
                emailRedirectTo: 'https://myfamille.shi-on.net/portal/entry-list',
            },
        });

        if (!error) {
            console.log('User signed up:', data);
            alert('認証メールを送信しました！');
            if (data.user && data.user.id) {
                await supabase
                    .from('users')
                    .update({
                        auth_user_id: data.user.id,
                        status: 'auth_mail_send',
                    })
                    .eq('user_id', userId);
            }
        } else {
            console.log('Sign-up error:', error);
            alert('メール送信に失敗しました：' + (error.message || '不明なエラー'));
        }

    };


    const handleSaveManagerNote = async () => {
        setNoteSaving(true);
        setNoteMsg(null);
        if (!entry) return;
        const { error } = await supabase
            .from('form_entries')
            .update({ manager_note: managerNote })
            .eq('id', entry.id);

        if (error) {
            setNoteMsg('保存に失敗しました：' + error.message);
        } else {
            setNoteMsg('保存しました');
        }
        setNoteSaving(false);
    };

    if (!entry) return <p className="p-4">読み込み中...</p>;

    const attachmentsArray = Array.isArray(entry.attachments) ? entry.attachments : [];
    const otherDocs = attachmentsArray.filter(
        (a) =>
            a.url !== null &&
            !['免許証表', '免許証裏', '住民票'].includes(a.type ?? '') &&
            !(a.label && a.label.startsWith('certificate_'))
    );
    const licenseFront = attachmentsArray.find((a) => a.type === '免許証表');
    const licenseBack = attachmentsArray.find((a) => a.type === '免許証裏');
    const residenceCard = attachmentsArray.find((a) => a.type === '住民票');
    const certifications = attachmentsArray.filter(
        (a) =>
            (a.label && a.label.startsWith('certificate_')) ||
            (a.type && a.type.includes('資格証'))
    );

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded shadow space-y-6">
            {entry.photo_url && (
                <div className="text-center">
                    <Image
                        src={entry.photo_url}
                        alt="顔写真"
                        width={160}
                        height={160}
                        className="inline-block h-40 w-40 rounded-full border object-cover shadow"
                    />
                </div>
            )}

            <h1 className="text-2xl font-bold">エントリー詳細</h1>
            <div className="grid md:grid-cols-2 gap-4">
                <div><strong>氏名（漢字）:</strong> {entry.last_name_kanji} {entry.first_name_kanji}</div>
                <div><strong>氏名（かな）:</strong> {entry.last_name_kana} {entry.first_name_kana}</div>
                <div><strong>性別:</strong> {entry.gender}</div>
                <div>
                    <strong>生年月日:</strong> {entry.birth_year}/{entry.birth_month}/{entry.birth_day}
                    {entry.birth_year && (
                        <span className="ml-2 text-gray-500">
                            （{new Date().getFullYear() - entry.birth_year -
                                ((new Date().getMonth() + 1 < entry.birth_month) ||
                                    (new Date().getMonth() + 1 === entry.birth_month && new Date().getDate() < entry.birth_day)
                                    ? 1 : 0)}歳）
                        </span>
                    )}
                </div>
                <div>
                    <strong>住所:</strong> 〒{entry.postal_code} {entry.address}
                    {entry.address && (
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-blue-600 underline"
                        >
                            地図
                        </a>
                    )}
                </div>
                <div><strong>電話番号:</strong> {entry.phone}</div>
                <div className="flex items-center gap-2">
                    <strong>メールアドレス:</strong> {entry.email}
                    {userRecord ? (
                        userRecord.auth_user_id ? (
                            <span className="px-2 py-1 rounded bg-gray-200 text-green-700 font-bold">認証完了</span>
                        ) : (
                            <button
                                className="px-2 py-1 bg-green-700 text-white rounded shadow hover:bg-green-800 transition text-sm"
                                onClick={handleSendInvite}
                                disabled={!userId || !entry?.email}
                            >
                                認証メール送信
                            </button>
                        )
                    ) : null}
                </div>
                {/*アカウントID入力・決定 UI の表示条件付きブロック */}
                {!userRecord && (
                    <div className="flex items-center border rounded p-2 gap-2 mt-2">
                        <label className="text-xs text-gray-500">アカウントID</label>
                        <input
                            value={userId}
                            onChange={e => setUserId(e.target.value)}
                            className="border rounded px-2 py-1 w-32"
                        />
                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition"
                            onClick={handleAccountCreate}
                            disabled={userIdLoading || !userId}
                        >
                            {userIdLoading ? "作成中..." : "アカウント決定"}
                        </button>
                        {userIdSuggestions.length > 0 && (
                            <div className="flex flex-col ml-4">
                                <span className="text-xs text-gray-500">候補:</span>
                                {userIdSuggestions.map(sug => (
                                    <button
                                        type="button"
                                        key={sug}
                                        className="text-blue-600 text-xs underline text-left"
                                        onClick={() => setUserId(sug)}
                                        disabled={sug === userId}
                                    >
                                        {sug}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div className="md:col-span-2 space-y-1">
                    <strong>職歴:</strong>
                    <table className="border w-full text-sm">
                        <thead>
                            <tr>
                                <th className="border px-2 py-1">勤務先</th>
                                <th className="border px-2 py-1">期間（開始）</th>
                                <th className="border px-2 py-1">期間（終了）</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3].map((n) => {
                                const w = entry[`workplace_${n}` as keyof EntryDetail];
                                const pf = entry[`period_from_${n}` as keyof EntryDetail] as string;
                                const pt = entry[`period_to_${n}` as keyof EntryDetail] as string;
                                if (!w) return null;
                                return (
                                    <tr key={n}>
                                        <td className="border px-2 py-1">{w as string}</td>
                                        <td className="border px-2 py-1">{pf ?? ""}</td>
                                        <td className="border px-2 py-1">{pt ?? ""}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="md:col-span-2">
                    <strong>志望動機:</strong><br />{entry.motivation}
                </div>
                <div>
                    <strong>働き方の希望:</strong>
                    <div>
                        <div>{entry.work_styles && entry.work_styles.length > 0 ? entry.work_styles.join('、') : '―'} <div>自由記述：{entry.workstyle_other ?? '―'}</div> </div>
                    </div>
                </div>
                <div>
                    <strong>通勤方法:</strong>
                    {entry.commute_options && entry.commute_options.length > 0
                        ? entry.commute_options.join('、')
                        : '―'}
                </div>
                <div><strong>健康状態:</strong> {entry.health_condition}</div>
            </div>

            <div className="space-y-4">
                <h2 className="text-lg font-semibold">アップロード画像</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <FileThumbnail
                        title="免許証（表）"
                        src={licenseFront?.url ?? undefined}
                        mimeType={licenseFront?.mimeType ?? undefined}
                    />
                    <FileThumbnail
                        title="免許証（裏）"
                        src={licenseBack?.url ?? undefined}
                        mimeType={licenseBack?.mimeType ?? undefined}
                    />
                    <FileThumbnail
                        title="住民票"
                        src={residenceCard?.url ?? undefined}
                        mimeType={residenceCard?.mimeType ?? undefined}
                    />
                </div>
            </div>

            {certifications && certifications.length > 0 && (
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold">資格証明書</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {certifications.map((cert, idx) => (
                            <FileThumbnail
                                key={idx}
                                title={cert.label ?? cert.type ?? `資格証明書${idx + 1}`}
                                src={cert.url ?? undefined}
                                mimeType={cert.mimeType ?? undefined}
                            />
                        ))}
                    </div>
                </div>
            )}

            {otherDocs && otherDocs.length > 0 && (
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold">その他の書類</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {otherDocs.map((doc, idx) => (
                            <FileThumbnail
                                key={idx}
                                title={doc.label ?? doc.type ?? `書類${idx + 1}`}
                                src={doc.url ?? undefined}
                                mimeType={doc.mimeType ?? undefined}
                            />
                        ))}
                    </div>
                </div>
            )}


            <div>
                <strong>同意内容:</strong>
                {entry.consent_snapshot ? (
                    <div className="text-xs text-gray-700 border rounded bg-gray-50 p-2 mt-1">
                        {Object.entries(JSON.parse(entry.consent_snapshot)).map(([k, v]) => (
                            <div key={k}>{v as string}</div>
                        ))}
                        <div className="mt-2 text-right text-gray-400">
                            登録日時：{entry.created_at && new Date(entry.created_at).toLocaleString()}
                        </div>
                    </div>
                ) : (
                    '―'
                )}
            </div>

            {/* マネジャー特記エリア */}
            <div className="mb-8">
                <h2 className="text-lg font-semibold mb-2">マネジャー特記・共有事項</h2>
                <textarea
                    className="w-full border rounded p-2 mb-2"
                    rows={5}
                    maxLength={2000}
                    value={managerNote}
                    onChange={e => setManagerNote(e.target.value)}
                    placeholder="このエントリーについて特記事項・サマリー・情報共有を記入"
                    disabled={noteSaving}
                />
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSaveManagerNote}
                        disabled={noteSaving}
                        className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                        {noteSaving ? '保存中...' : '保存'}
                    </button>
                    {noteMsg && <span className="text-sm">{noteMsg}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">（最大2000文字まで保存可能）</div>
            </div>


            {/* ここでログセクションを挿入 */}
            <StaffLogSection staffId={entry.id} />
            <div className="flex justify-center items-center gap-4 pt-8">
                {userRecord && !userRecord.auth_user_id && (
                    <button
                        className="px-4 py-2 bg-green-700 text-white rounded shadow hover:bg-green-800 transition"
                        onClick={handleSendInvite}
                        disabled={!userId || !entry?.email}
                    >
                        認証メール送信
                    </button>
                )}
                <Link
                    href="/portal/entry-list"
                    className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 flex items-center gap-2 transition"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
                    戻る
                </Link>
            </div>
        </div>
    );
}

// 職員ログ（追加＋一覧）セクション
function StaffLogSection({ staffId }: { staffId: string }) {
    const [logs, setLogs] = useState<StaffLog[]>([]);
    const [actionAt, setActionAt] = useState('');
    const [actionDetail, setActionDetail] = useState('');
    const [registeredBy, setRegisteredBy] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ログ一覧取得
    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('staff_log')
            .select('*')
            .eq('staff_id', staffId)
            .order('action_at', { ascending: false });

        if (error) {
            setError(error.message);
        } else {
            setLogs(data as StaffLog[]);
        }
        setLoading(false);
    }, [staffId]);

    useEffect(() => {
        if (staffId) fetchLogs();
    }, [staffId, fetchLogs]);

    // 追加イベント
    const handleAddLog = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!actionAt || !actionDetail || !registeredBy) {
            setError('全項目入力してください。');
            return;
        }

        const { error } = await addStaffLog({
            staff_id: staffId,
            action_at: actionAt,
            action_detail: actionDetail,
            registered_by: registeredBy,
        });

        if (error) {
            setError(error);
        } else {
            setActionAt('');
            setActionDetail('');
            setRegisteredBy('');
            fetchLogs();
        }
    };

    return (
        <div className="my-12">
            <h2 className="text-lg font-semibold mb-2">職員対応ログ（最新順）</h2>
            <form onSubmit={handleAddLog} className="mb-4 space-y-2 p-4 border rounded bg-gray-50">
                <div>
                    <label className="mr-2">日時:</label>
                    <input
                        type="datetime-local"
                        value={actionAt}
                        onChange={e => setActionAt(e.target.value)}
                        className="border px-2 py-1 rounded"
                        required
                    />
                </div>
                <div>
                    <label className="mr-2">内容:</label>
                    <input
                        type="text"
                        value={actionDetail}
                        onChange={e => setActionDetail(e.target.value)}
                        className="border px-2 py-1 rounded w-80"
                        required
                    />
                </div>
                <div>
                    <label className="mr-2">登録者:</label>
                    <input
                        type="text"
                        value={registeredBy}
                        onChange={e => setRegisteredBy(e.target.value)}
                        className="border px-2 py-1 rounded"
                        required
                    />
                </div>
                <button type="submit" className="ml-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">追加</button>
                {error && <p className="text-red-500 mt-2">{error}</p>}
            </form>
            {loading ? (
                <p>読み込み中...</p>
            ) : logs.length === 0 ? (
                <p className="text-gray-500">履歴はまだありません。</p>
            ) : (
                <table className="w-full text-sm border bg-white rounded">
                    <thead>
                        <tr>
                            <th className="border px-2 py-1">日時</th>
                            <th className="border px-2 py-1">内容</th>
                            <th className="border px-2 py-1">登録者</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td className="border px-2 py-1">{new Date(log.action_at).toLocaleString()}</td>
                                <td className="border px-2 py-1">{log.action_detail}</td>
                                <td className="border px-2 py-1">{log.registered_by}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// 画像表示＋PDFボタン
function FileThumbnail({ title, src, mimeType }: { title: string; src?: string; mimeType?: string | null }) {
    if (!src) {
        return (
            <div className="text-sm text-center text-gray-500">
                {title}<br />
                ファイルなし
            </div>
        );
    }

    if (mimeType === "application/pdf") {
        return (
            <div className="text-sm text-center">
                <p className="mb-1">{title}</p>
                <a href={src} target="_blank" rel="noopener noreferrer" className="inline-block p-2 border rounded bg-gray-100 hover:bg-gray-200">
                    📄 PDF/ファイルを開く
                </a>
            </div>
        );
    }

    return (
        <div className="text-sm text-center">
            <p className="mb-1">{title}</p>
            <Image
                src={src}
                alt={title}
                width={320}
                height={192}
                className="w-full h-auto max-h-48 object-contain rounded border hover:scale-105 transition-transform"
            />
            <div className="mt-2">
                <a href={src} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                    ファイルとして開く
                </a>
            </div>
        </div>
    );
}

// 複数候補を返す関数
function getUserIdSuggestions(
    { firstKana, lastKana }: NameInfo,
    existingIds: string[]
): string[] {
    const firstHeb = hepburn.fromKana(firstKana).toLowerCase().replace(/[^a-z]/g, "");
    const lastHeb = hepburn.fromKana(lastKana).toLowerCase().replace(/[^a-z]/g, "");
    const firstInitial = firstHeb.charAt(0);
    const lastInitial = lastHeb.charAt(0);

    const candidates = [
        `${firstHeb}${lastHeb}`,
        `${firstInitial}${lastHeb}`,
        `${firstHeb}${lastInitial}`,
        `${firstInitial}${lastInitial}${lastHeb}`,
        `${firstInitial}${lastInitial}${firstHeb}`,
    ];
    const base = `${firstHeb}${lastHeb}`;
    for (let num = 2; num < 5; num++) {
        candidates.push(`${base}${num}`);
    }
    return candidates.filter(c => !existingIds.includes(c));
}
