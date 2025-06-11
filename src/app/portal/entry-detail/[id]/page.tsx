'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';

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
}

export default function EntryDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [entry, setEntry] = useState<EntryDetail | null>(null);

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
            }
        };

        if (id) fetchEntry();
    }, [id]);

    if (!entry) return <p className="p-4">読み込み中...</p>;

    // attachmentsからtypeで仕分け
    const licenseFront = entry.attachments?.find(a => a.type === '免許証表');
    const licenseBack = entry.attachments?.find(a => a.type === '免許証裏');
    const residenceCard = entry.attachments?.find(a => a.type === '住民票');
    // 資格証明書（labelまたはtypeがcertificate_で始まる or type: 資格証明書系）
    const certifications = entry.attachments?.filter(
        a =>
            (a.label && a.label.startsWith('certificate_')) ||
            (a.type && a.type.includes('資格証'))
    );

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded shadow space-y-6">
            <button
                onClick={() => router.back()}
                className="text-blue-600 underline text-sm hover:text-blue-800"
            >
                ← 一覧に戻る
            </button>

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
                {/* 生年月日＋年齢 */}
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
                <div><strong>住所:</strong> 〒{entry.postal_code} {entry.address}</div>
                <div><strong>電話番号:</strong> {entry.phone}</div>
                <div><strong>メールアドレス:</strong> {entry.email}</div>
                {/* 職歴 */}
                <div className="space-y-1">
                    <strong>職歴:</strong>
                    <ul>
                        {[1, 2, 3].map((n) => {
                            const w = entry[`workplace_${n}` as keyof EntryDetail];
                            if (!w) return null;
                            return (
                                <li key={n}>
                                    {w as string}
                                    （
                                    {(entry[`period_from_${n}` as keyof EntryDetail] as string) ?? ''}
                                    〜
                                    {(entry[`period_to_${n}` as keyof EntryDetail] as string) ?? ''}
                                    ）
                                </li>

                            );
                        })}
                    </ul>
                </div>
                <div className="md:col-span-2">
                    <strong>志望動機:</strong><br />{entry.motivation}
                </div>
                {/* 働き方の希望 */}
                <div>
                    <strong>働き方の希望:</strong>
                    <div>
                        <div> <strong>働き方の希望:</strong> {entry.work_styles && entry.work_styles.length > 0 ? entry.work_styles.join('、') : '―'} <div>自由記述：{entry.workstyle_other ?? '―'}</div> </div> ``
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

            <div>
                <strong>同意内容:</strong>
                {entry.consent_snapshot ? (
                    <div className="text-xs text-gray-700 border rounded bg-gray-50 p-2 mt-1">
                        {Object.entries(JSON.parse(entry.consent_snapshot)).map(([k, v]) => (
                            <div key={k}>{v as string}</div>
                        ))}
                    </div>
                ) : (
                    '―'
                )}
            </div>

        </div>
    );
}

// 画像表示＋PDFボタン（従来どおり）
function FileThumbnail({ title, src, mimeType }: { title: string; src?: string; mimeType?: string | null }) {
    // ここで受け取った値を全部log！
    console.log('[FileThumbnail] title:', title, 'src:', src, 'mimeType:', mimeType);


    if (!src) return <div>画像なし</div>;

    // PDFならimgはスキップ
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

    // 画像ならimg表示
    return (
        <div className="text-sm text-center">
            <p className="mb-1">{title}</p>
            <Image
                src={src!}
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


