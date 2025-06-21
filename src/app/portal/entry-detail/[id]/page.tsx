'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
import Link from 'next/link';
import { addStaffLog } from '@/lib/addStaffLog';
import hepburn from 'hepburn';
import { createLineWorksUser } from '@/lib/lineworksService';

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

/*
type OrgUnit = {
    orgUnitId: string;
    orgUnitName: string;
};
*/

/*
type Level = {
    levelId: string;
    levelName: string;
};

type Position = {
    positionId: string;
    positionName: string;
};
*/


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

    const [orgList, setOrgList] = useState<{ orgUnitId: string; orgUnitName: string }[]>([]);
    const [levelList, setLevelList] = useState<{ levelId: string; levelName: string }[]>([]);
    const [positionList, setPositionList] = useState<{ positionId: string; positionName: string }[]>([]);

    const [selectedOrg, setSelectedOrg] = useState<string>('');
    const [selectedLevel, setSelectedLevel] = useState<string>('');
    const [selectedPosition, setSelectedPosition] = useState<string>('');

    useEffect(() => {
        const fetchData = async () => {
            // OrgUnits
            try {
                const positions = await fetch('/api/lineworks/getPositions').then(res => res.json());
                console.log('クライアントで受け取った positionList:', positions);
                setPositionList([{ positionId: '', positionName: 'なし' }, ...positions]);
            } catch (err) {
                console.error('Position データ取得エラー:', err instanceof Error ? err.message : err);
            }
            // Levels
            try {
                const levels = await fetch('/api/lineworks/getLevels').then(res => res.json());
                console.log('クライアントで受け取った levelList:', levels);
                setLevelList([{ levelId: '', levelName: 'なし' }, ...levels]);
            } catch (err) {
                console.error('Level データ取得エラー:', err);
            }

            // Positions
            try {
                const positions = await fetch('/api/lineworks/getPositions').then(res => res.json());
                console.log('クライアントで受け取った positionList:', positions);
                setPositionList([{ positionId: '', positionName: 'なし' }, ...positions]);
            } catch (err) {
                console.error('Position データ取得エラー:', err instanceof Error ? err.message : err);
            }
        };

        fetchData();
    }, []);

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
            await fetchUserRecord();
        } else {
            alert('エラーが発生しました：' + (error.message || ''));
        }
    };


    const [sendingInvite, setSendingInvite] = useState(false);
    const [inviteSent, setInviteSent] = useState(false);

    const handleSendInvite = async () => {
        if (!userId || !entry?.email) {
            alert('必要な情報が不足しています。');
            return;
        }

        setSendingInvite(true);
        setInviteSent(false);

        try {
            // 🔑 仮パスワード生成
            const password = Math.random().toString(36).slice(-8) + 'Aa1!';

            // 🔑 Supabase サインアップ
            const { data, error } = await supabase.auth.signUp({
                email: entry.email,
                password,
                options: {
                    emailRedirectTo: 'https://myfamille.shi-on.net/signup/complete',
                    data: {
                        full_name: `${entry.last_name_kanji} ${entry.first_name_kanji}`
                    }
                }
            });

            if (error) {
                console.error('Sign-up error:', error);
                alert(`メール送信に失敗しました: ${error.message}`);
                return;
            }

            if (!data.user?.id) {
                alert('認証ユーザー情報が取得できませんでした。');
                return;
            }

            alert('認証メールを送信しました！');
            setInviteSent(true);

            // 📝 users テーブルを更新
            const { error: updateError } = await supabase.from('users')
                .update({
                    auth_user_id: data.user.id,
                    status: 'auth_mail_send'
                })
                .eq('user_id', userId);

            if (updateError) {
                console.error('Supabase users 更新エラー:', updateError);
                alert('ユーザー情報更新に失敗しました。');
                return;
            }

            // 🏢 LINE WORKS ユーザー作成
            const fullName = `${entry.last_name_kanji ?? ''} ${entry.first_name_kanji ?? ''}`.trim();
            if (!fullName) {
                alert('氏名情報が不足しています。');
                return;
            }

            const result = await createLineWorksUser(
                userId,
                entry.last_name_kanji,
                entry.first_name_kanji,
                entry.last_name_kana,
                entry.first_name_kana,
                selectedLevel,
                selectedOrg,
                selectedPosition
            );

            if (result.success === false) {
                // success: false の場合は error が必ずある
                console.error('LINE WORKS ユーザー作成失敗:', result.error);
                alert(`LINE WORKS アカウント作成に失敗しました: ${result.error}`);
                setSendingInvite(false);
                return;
            }

            // success: true の場合
            const tempPassword = result.tempPassword;

            // 仮パスワードを保存
            const { error: pwError } = await supabase.from('users')
                .update({
                    temp_password: tempPassword
                })
                .eq('user_id', userId);

            if (pwError) {
                console.error('仮パスワード保存エラー:', pwError);
                alert('仮パスワードの保存に失敗しました。');
            } else {
                alert('LINE WORKS アカウントを作成しました！');
            }


        } catch (e) {
            console.error('招待送信中エラー:', e);
            alert('招待送信中に予期しないエラーが発生しました。');
        } finally {
            setSendingInvite(false);
        }
    };


    useEffect(() => {
        if (!userRecord?.auth_user_id) return;
        const interval = setInterval(async () => {
            const { data, error } = await supabase.auth.admin.getUserById(userRecord.auth_user_id);
            if (!error && data.user?.last_sign_in_at) {
                setUserRecord(prev => prev ? { ...prev, auth_user_id: data.user.id } : prev);
                clearInterval(interval);  // 認証完了で監視終了
            }
        }, 5000);  // 5秒おきに確認（必要に応じて間隔調整）

        return () => clearInterval(interval);
    }, [userRecord?.auth_user_id]);


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


    const [sendingContract, setSendingContract] = useState(false);

    const handleSendContractMail = async () => {
        if (!entry) {
            alert('エントリー情報が取得できていません。');
            return;
        }

        setSendingContract(true);  // ここを追加！

        const result = await fetch('/api/send-contract-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                entry,  // 必要に応じて必要なデータだけ送る
            }),
        });

        const resJson = await result.json();

        if (result.ok) {
            alert(`雇用契約書メールを ${entry.email} に送信しました。`);
        } else {
            alert(`メール送信に失敗しました: ${resJson.error}`);
        }

        setSendingContract(false);
    };

    const [lineWorksExists, setLineWorksExists] = useState<boolean | null>(null);


    useEffect(() => {
        if (entry) {
            console.log('LINE WORKS アカウント作成送信データ', {
                userId,
                fullName: `${entry.last_name_kanji} ${entry.first_name_kanji}`,
                email: entry.email
            });
        }
    }, [entry, userId]);


    // LINE WORKS

    // サーバーAPIを呼び出すだけにする
    const handleCreateLineWorksAccount = async () => {
        if (!userId || !entry || !entry.email) {
            alert('必要な情報が不足しています。');
            return;
        }

        try {
            const res = await fetch('/api/lineworks/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    lastName: entry.last_name_kanji,
                    firstName: entry.first_name_kanji,
                    phoneticLastName: entry.last_name_kana,
                    phoneticFirstName: entry.first_name_kana,
                    levelId: selectedLevel,
                    orgUnitId: selectedOrg,
                    positionId: selectedPosition
                })
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                console.error('LINE WORKS アカウント作成失敗:', data.error);
                alert(`LINE WORKS アカウント作成に失敗しました: ${data.error}`);
                return;
            }

            alert(`LINE WORKS アカウント作成成功！仮パスワード: ${data.tempPassword}`);
            setLineWorksExists(true); // 成功したら直接 true にしてOK
        } catch (err) {
            console.error('LINE WORKS アカウント作成中エラー:', err);
            alert('LINE WORKS アカウント作成中にエラーが発生しました。');
        }
    };

    useEffect(() => {
        const load = async () => {
            if (!userId) return;

            try {
                const res = await fetch('/api/check-lineworks-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId }),
                });

                const text = await res.text();

                try {
                    const data = JSON.parse(text);
                    if (res.ok && typeof data.exists === 'boolean') {
                        setLineWorksExists(data.exists);
                    } else {
                        console.warn('LINE WORKS ユーザー確認のレスポンスが不正です:', data);
                        setLineWorksExists(null);
                    }
                } catch (parseErr) {
                    console.warn('JSON パース失敗（check-user）:', parseErr, 'レスポンス内容:', text);
                    setLineWorksExists(null);  // パース失敗でも止めない
                }

            } catch (err) {
                console.error('LINE WORKS ユーザー確認中エラー:', err);
                setLineWorksExists(null);
            }
        };

        load();
    }, [userId]);


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
                {/* メールアドレスと認証状態・認証ボタン */}
                <div className="flex items-center gap-2">
                    <strong>メールアドレス:</strong> {entry.email}
                    <div className="flex flex-col gap-2">

                        {userRecord ? (
                            <div className="space-y-2">
                                {/* 認証状態・ボタン */}
                                {userRecord.auth_user_id ? (
                                    <span className="px-2 py-1 rounded bg-gray-200 text-green-700 font-bold">
                                        認証完了
                                    </span>
                                ) : sendingInvite ? (
                                    <button className="px-4 py-1 bg-green-700 text-white rounded" disabled>
                                        認証メール送信中...
                                    </button>
                                ) : inviteSent ? (
                                    <span className="px-2 py-1 rounded bg-yellow-200 text-yellow-700 whitespace-nowrap">
                                        認証メール送信済
                                    </span>
                                ) : (
                                    <button
                                        className="px-2 py-0.5 bg-green-700 text-white rounded hover:bg-green-800 text-sm whitespace-nowrap"
                                        onClick={handleSendInvite}
                                    >
                                        認証メール送信
                                    </button>
                                )}

                                {/* LINE WORKS アカウント生成ボタン（users レコードがある場合のみ表示） */}
                                {lineWorksExists ? (
                                    <span className="px-2 py-1 rounded bg-gray-200 text-blue-700 font-bold">LINE WORKS 登録済</span>
                                ) : (
                                    <button
                                        className="px-2 py-0.5 bg-blue-700 text-white rounded hover:bg-blue-800 text-sm whitespace-nowrap"
                                        onClick={handleCreateLineWorksAccount}
                                    >
                                        LINE WORKS アカウント生成
                                    </button>
                                )}

                            </div>
                        ) : (
                            <span className="text-sm text-gray-500">ユーザーID未登録（まずIDを決定してください）</span>
                        )}

                        {/* 雇用契約書メール送信ボタン */}
                        <button
                            onClick={handleSendContractMail}
                            disabled={sendingContract}
                            className="px-2 py-0.5 bg-purple-700 text-white rounded shadow hover:bg-purple-800 text-sm whitespace-nowrap"
                        >
                            {sendingContract ? '送信中...' : '雇用契約書ﾒｰﾙ送信'}
                        </button>

                    </div>
                </div>
                {/* ユーザーID表示・入力・決定欄 */}
                <div className="flex items-center border rounded p-2 gap-2 mt-2">
                    <label className="text-xs text-gray-500">ユーザーID</label>

                    {userRecord ? (
                        <span className="text-sm text-gray-700 font-mono">{userRecord.user_id}</span>
                    ) : (
                        <>
                            <input
                                value={userId}
                                onChange={e => setUserId(e.target.value)}
                                className="border rounded px-2 py-1 w-32"
                            />
                            <button
                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition whitespace-nowrap"
                                onClick={handleAccountCreate}
                                disabled={userIdLoading || !userId}
                            >
                                {userIdLoading ? "作成中..." : "ﾕｰｻﾞｰID決定"}
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
                        </>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                        <label className="block text-sm text-gray-600">所属組織</label>
                        <select
                            className="border rounded px-2 py-1 w-full"
                            value={selectedOrg}
                            onChange={e => setSelectedOrg(e.target.value)}
                        >
                            <option value="">選択してください</option>
                            {orgList.map(org => (
                                <option key={org.orgUnitId} value={org.orgUnitId}>
                                    {org.orgUnitName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600">職級</label>
                        <select
                            className="border rounded px-2 py-1 w-full"
                            value={selectedLevel}
                            onChange={e => setSelectedLevel(e.target.value)}
                        >
                            <option value="">選択してください</option>
                            {levelList.map(level => (
                                <option key={level.levelId} value={level.levelId}>
                                    {level.levelName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-600">役職</label>
                        <select
                            className="border rounded px-2 py-1 w-full"
                            value={selectedPosition}
                            onChange={e => setSelectedPosition(e.target.value)}
                        >
                            <option value="">選択してください</option>
                            {positionList.map(pos => (
                                <option key={pos.positionId} value={pos.positionId}>
                                    {pos.positionName}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

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
// 画像表示＋PDFボタン
function FileThumbnail({
    title,
    src,
    mimeType
}: { title: string; src?: string; mimeType?: string | null }) {
    if (!src) {
        return (
            <div className="text-sm text-center text-gray-500">
                {title}<br />
                ファイルなし
            </div>
        );
    }

    // fileId を URL から抽出（Google Drive の共有 URL を前提）
    const fileIdMatch = src.match(/[-\w]{25,}/);
    const fileId = fileIdMatch ? fileIdMatch[0] : null;

    if (!fileId) {
        return (
            <div className="text-sm text-center text-red-500">
                {title}<br />
                無効なURL
            </div>
        );
    }

    // Google Drive のダウンロードリンク（PDFの場合は download にしてもOK）
    const driveUrl = mimeType === "application/pdf"
        ? `https://drive.google.com/uc?export=download&id=${fileId}`
        : `https://drive.google.com/uc?export=view&id=${fileId}`;

    if (mimeType === "application/pdf") {
        return (
            <div className="text-sm text-center">
                <p className="mb-1">{title}</p>
                <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block p-2 border rounded bg-gray-100 hover:bg-gray-200"
                >
                    📄 PDF/ファイルを開く
                </a>
            </div>
        );
    }

    return (
        <div className="text-sm text-center">
            <p className="mb-1">{title}</p>
            <Image
                src={driveUrl}
                alt={title}
                width={320}
                height={192}
                className="w-full h-auto max-h-48 object-contain rounded border hover:scale-105 transition-transform"
            />
            <div className="mt-2">
                <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                >
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

