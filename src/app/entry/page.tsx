//entry
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import PostSubmitMessage from "@/components/PostSubmitMessage";
import { HomeIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
//import { convertDriveUrlToDirectView } from "@/lib/drive"
import Footer from '@/components/Footer'; // ← 追加
//import { addStaffLog } from '@/lib/addStaffLog';
//import { parseDocAcquired } from "@/components/DocUploader";



export default function EntryPage() {
    const MAX_FILE_MB = 4;
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 失敗時の共通関数
    //const fail = (msg: string) => { alert(msg); setIsSubmitting(false); };

    const [formData, setFormData] = useState<FormData | null>(null);
    const [postalCode, setPostalCode] = useState("");
    const [address, setAddress] = useState(""); // ←住所欄に反映する
    
    const fetchAddressFromPostalCode = useCallback(async () => {
        if (postalCode.length !== 7) return;

        try {
            const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`);
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                const fullAddress = `${result.address1}${result.address2}${result.address3}`;
                setAddress(fullAddress);
            } else {
                alert("郵便番号に該当する住所が見つかりませんでした");
            }
        } catch (error) {
            console.error("住所取得エラー:", error);
            alert("住所の取得に失敗しました");
        }
    }, [postalCode]);

    useEffect(() => {
        if (postalCode.length === 7) {
            fetchAddressFromPostalCode();
        }
    }, [postalCode, fetchAddressFromPostalCode]);

    const [docMaster, setDocMaster] = useState<{ certificate: string[] }>({ certificate: [] });

    useEffect(() => {
        const loadDocMaster = async () => {
            const { data, error } = await supabase
                .from("user_doc_master")
                .select("category,label,is_active,sort_order")
                .eq("category", "certificate")
                .eq("is_active", true)
                .order("sort_order", { ascending: true });

            if (!error && data) {
                setDocMaster({ certificate: data.map(r => r.label) });
            }
        };
        loadDocMaster();
    }, []);

    // エントリーフォーム送信時の主処理
    // - 入力バリデーション
    // - 重複エントリーチェック（2重登録防止）
    // - ファイルアップロード（Google Drive）
    // - DB登録（Supabase）
    // - メール送信
    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const formEl = e.currentTarget;
        const form = new FormData(formEl);

        // 必須テキスト（氏名は姓+名を結合）
        const lastNameKanji = String(form.get("lastNameKanji") || "").trim();
        const firstNameKanji = String(form.get("firstNameKanji") || "").trim();
        //const applicantName = `${lastNameKanji}${firstNameKanji}`;
        const email = String(form.get("email") || "").trim();

        if (!lastNameKanji || !firstNameKanji) {
            alert("氏名を入力してください。");
            return;
        }
        if (!email) {
            alert("メールアドレスを入力してください。");
            return;
        }

        // 画像ファイル（name はフォーム側と合わせてください）
        const licenseFront = (form.get("licenseFront") as File) ?? null;
        const licenseBack = (form.get("licenseBack") as File) ?? null;
        const residenceCard = (form.get("residenceCard") as File) ?? null;
        const photoFile = (form.get("photo") as File) ?? null;

        setIsSubmitting(true);

        // ---- ユーティリティ（この関数内だけで完結：失敗しても throw しない） ----
        const timestamp = (() => {
            const d = new Date();
            const pad = (n: number) => n.toString().padStart(2, "0");
            return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        })();

        async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, ms = 45000) {
            const ctrl = new AbortController();
            const id = setTimeout(() => ctrl.abort(), ms);
            try { return await fetch(input, { ...init, signal: ctrl.signal }); }
            finally { clearTimeout(id); }
        }

        function toViewUrl(raw: string | null): string | null {
            if (!raw) return null;
            const m = raw.match(/\/d\/([^/]+)/);
            return m?.[1] ? `https://drive.google.com/uc?export=view&id=${m[1]}` : raw;
        }

        async function uploadFileOrNull(key: string, file: File | null): Promise<string | null> {
            if (!file || file.size === 0) return null;
            const fd = new FormData();
            fd.append("file", file);
            fd.append("filename", `${key}_${timestamp}_${file.name}`);
            // 最大2回リトライ。失敗しても throw せず null を返す
            for (let i = 0; i < 2; i++) {
                try {
                    const res = await fetchWithTimeout("/api/upload", { method: "POST", body: fd });
                    if (!res.ok) throw new Error(`upload ${key} failed: ${res.status}`);
                    const result = await res.json();
                    return toViewUrl(result.url || null);
                } catch {
                    /* retry */
                }
            }
            return null; // ← 失敗しても続行
        }

        // ---- 画像はベストエフォートで並列アップロード（失敗しても止めない） ----
        const [licenseFrontUrl, licenseBackUrl, residenceCardUrl, photoUrl] = await Promise.all([
            uploadFileOrNull("licenseFront", licenseFront),
            uploadFileOrNull("licenseBack", licenseBack),
            uploadFileOrNull("residenceCard", residenceCard),
            uploadFileOrNull("photo", photoFile),
        ]);

        const certTasks: Promise<string | null>[] = [];
        for (let i = 0; i < 20; i++) {
            const f = (form.get(`certificate_${i}`) as File) ?? null;
            if (f && f.size > 0) certTasks.push(uploadFileOrNull(`certificate_${i}`, f));
        }
        const certSettled = await Promise.allSettled(certTasks);
        const certificationUrls = certSettled.map(s => (s.status === "fulfilled" ? s.value : null)).filter(Boolean) as string[];

        // ---- テキストpayloadを構築（Fileは除外） -----------------------------------
        const textPayload: Record<string, string | boolean | null> = {};
        for (const [k, v] of form.entries()) {
            if (v instanceof File) continue;
            textPayload[k] = v === "on" ? true : (typeof v === "string" ? v : String(v));
        }

        // 画像の成否にかかわらず進める。取れたURLだけ載せる
        const anyAttachment = !!(licenseFrontUrl || licenseBackUrl || residenceCardUrl || photoUrl || certificationUrls.length);

        // ---- 保存（Supabase 直） -------------------------------------------------
        const payloadForDB = {
            // --- 名前 ---
            last_name_kanji: lastNameKanji,
            first_name_kanji: firstNameKanji,
            last_name_kana: String(form.get("lastNameKana") || ""),
            first_name_kana: String(form.get("firstNameKana") || ""),
            // --- 生年月日・属性 ---
            birth_year: Number(form.get("birthYear") || 0) || null,
            birth_month: Number(form.get("birthMonth") || 0) || null,
            birth_day: Number(form.get("birthDay") || 0) || null,
            gender: String(form.get("gender") || ""),
            // --- 連絡先・住所 ---
            email,
            phone: String(form.get("phone") || ""),
            postal_code: postalCode,
            address,
            // --- 志望・健康 ---
            motivation: String(form.get("motivation") || ""),
            workstyle_other: String(form.get("workStyleOther") || ""),
            health_condition: String(form.get("healthCondition") || ""),
            // --- 配列（text[]） ---
            work_styles: form.getAll("workStyle").map(String),  // ← スキーマの work_styles に対応
            commute_options: form.getAll("commute").map(String),
            // --- 画像URL（個別列 & jsonb） ---
            license_front_url: licenseFrontUrl,
            license_back_url: licenseBackUrl,
            residence_card_url: residenceCardUrl,
            photo_url: photoUrl,
            certifications: certificationUrls,                  // ← jsonb カラム
            // --- 同意 ---
            agreed_terms: Boolean(form.get("agreeTerms")),
            agreed_privacy: Boolean(form.get("agreePrivacy")),
            // created_at は DB の default now() に任せる
        };

        console.log("🚀 Supabaseへ送信するpayload:", payloadForDB);

        const { data: insertData, error: insertError } = await supabase
            .from("form_entries")
            .insert([payloadForDB])
            .select();


        if (insertError) {
            console.error("送信失敗:", insertError);
            alert(`送信に失敗しました：${insertError.message ?? "不明なエラー"}`);
            setIsSubmitting(false);
            return;
        }

        console.log("✅ insert成功！次に進みます");

        // ---- メール通知（失敗しても応募は成立） ----------------------------------
        try {
            await fetch("/api/send-entry-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entryId: insertData?.[0]?.id,
                    ...payloadForDB,  // ここは“フラットな”payloadをそのまま
                }),
            });
        } catch (err) {
            console.warn("メール通知に失敗しました", err);
        }

        // ---- 完了UI --------------------------------------------------------------
        formEl.reset();
        alert(anyAttachment
            ? "エントリーを送信しました（画像も一部またはすべて受け取りました）。"
            : "エントリー（テキスト）は送信しました。画像は後からでも提出できます。"
        );
        setIsSubmitting(false);
        setSubmitted(true);
        setFormData(form);

    }


    if (submitted && formData) {
        return <PostSubmitMessage form={formData} />;
    }


    return (
        <main className="min-h-screen bg-famille text-gray-800 px-4 py-10">
            <div className="max-w-[1600px] mx-auto bg-white p-8 rounded shadow space-y-8">

                <div className="text-right">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-gray-600 underline hover:text-blue-600"
                    >
                        <HomeIcon className="w-5 h-5" />
                        ホームに戻る
                    </Link>
                </div>
                <h1 className="text-2xl font-bold text-famille text-center">
                    登録フォーム
                </h1>
                <p className="text-sm text-gray-600 mb-4">
                    <span className="text-red-500">*</span> 印の項目は必須です。
                </p>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    {/* 1. 基本情報 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">1. 基本情報</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium">氏（漢字）<span className="text-red-500">*</span></label>
                                <input type="text" name="lastNameKanji" className="w-full border rounded p-2" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">名（漢字）<span className="text-red-500">*</span></label>
                                <input type="text" name="firstNameKanji" className="w-full border rounded p-2" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">氏（ふりがな）<span className="text-red-500">*</span></label>
                                <input type="text" name="lastNameKana" className="w-full border rounded p-2" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">名（ふりがな）<span className="text-red-500">*</span></label>
                                <input type="text" name="firstNameKana" className="w-full border rounded p-2" required />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium">生年月日（半角・西暦で入力してください）<span className="text-red-500">*</span></label>
                                <div className="flex gap-2">
                                    <input type="number" name="birthYear" placeholder="年（例：1990）" className="w-1/3 border rounded p-2" required />
                                    <input type="number" name="birthMonth" placeholder="月（例：01）" className="w-1/3 border rounded p-2" required />
                                    <input type="number" name="birthDay" placeholder="日（例：23）" className="w-1/3 border rounded p-2" required />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium">性別（戸籍上）<span className="text-red-500">*</span></label>
                                <div className="flex gap-4">
                                    <label className="flex items-center text-sm">
                                        <input type="radio" name="gender" value="男性" required className="mr-2" />
                                        男性
                                    </label>
                                    <label className="flex items-center text-sm">
                                        <input type="radio" name="gender" value="女性" required className="mr-2" />
                                        女性
                                    </label>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                    ※介護サービス提供における<strong>同性介助の必要性、また職員個人の健康管理（検診等）の管理</strong>のため、<strong>戸籍上の性別</strong>をご申告いただいております。事業所内で職員の性別を広域に表示するものはございません
                                </p>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700">
                                    郵便番号 <span className="text-red-500">*</span>
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-600">〒</span>
                                    <div className="w-32">
                                        <input
                                            type="text"
                                            name="postalCode"
                                            value={postalCode}
                                            onChange={(e) => {
                                                const raw = e.target.value.replace(/[^0-9]/g, "");
                                                setPostalCode(raw);
                                            }}
                                            className="w-full rounded border-gray-300 shadow-sm"
                                            placeholder="1234567"
                                            maxLength={8}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium">住所<span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    name="address"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)} // ← 自由編集を許可
                                    className="w-full border rounded p-2"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">電話番号（半角数字のみ）<span className="text-red-500">*</span></label>
                                <input type="tel" name="phone" inputMode="numeric" pattern="[0-9]*" className="w-full border rounded p-2" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">メールアドレス<span className="text-red-500">*</span></label>
                                <input type="email" name="email" className="w-full border rounded p-2" required />
                            </div>
                        </div>
                    </div>

                    {/* 2. 職歴（最大3件） */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">2. 職歴</h2>
                        {[1, 2, 3].map((num) => (
                            <div key={num} className="space-y-2 border p-4 rounded">
                                <p className="text-sm font-medium">職歴 {num}</p>
                                <input type="text" name={`workplace_${num}`} className="w-full border rounded p-2" placeholder="勤務先名" />
                                <div className="flex gap-2">
                                    <input type="text" name={`periodFrom_${num}`} className="w-1/2 border rounded p-2" placeholder="開始年月（例：2020/04）" />
                                    <input type="text" name={`periodTo_${num}`} className="w-1/2 border rounded p-2" placeholder="終了年月（例：2023/03）" />
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-gray-600 mt-1">※3件未満の場合は記載できる範囲でご入力ください。</p>
                    </div>

                    {/* 3. 志望動機 */}
                    <div style={{ overflowX: "auto" }}>
                        <h2 className="text-lg font-semibold mb-2">3. 志望動機<span className="text-red-500">*</span></h2>
                        <textarea
                            name="motivation"
                            placeholder="ファミーユで働きたい理由を自由にご記入ください"
                            rows={4}
                            style={{
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                padding: "12px",
                                resize: "vertical",
                                width: "70%",
                                minWidth: "90%",
                                maxWidth: "none",
                                boxSizing: "border-box",
                            }}
                            required
                        />
                    </div>

                    {/* 4. 働き方の希望 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">4. 働き方の希望</h2>
                        <div className="space-y-2">
                            {[
                                "正社員を希望している（エントリー後採用面接に進みます）　",
                                "希望する曜日・時間で働きたい　",
                                "スキマ時間で働きたい　"
                            ].map((option, idx) => (
                                <label key={idx} className="block text-sm">
                                    <input type="checkbox" name="workStyle" value={option} className="mr-2" />
                                    {option}
                                </label>
                            ))}

                            <label className="workstyle-other-label">自由記述欄（その他希望）</label>

                            <textarea
                                name="workStyleOther"
                                rows={4}
                                placeholder="その他希望があればご記入ください"
                                style={{
                                    border: "1px solid #ccc",
                                    borderRadius: "8px",
                                    padding: "12px",
                                    resize: "vertical",
                                    width: "90%",
                                    boxSizing: "border-box",
                                }}
                            />
                        </div>
                    </div>

                    {/* 5. 通勤方法 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">5. 通勤方法</h2>
                        <p className="text-sm text-gray-700 mb-2">直行直帰の勤務になります。利用予定の通勤手段をすべて選択してください。</p>
                        <div className="space-y-2">
                            {[
                                "公共交通機関・徒歩　",
                                "自転車　",
                                "バイク（免許証の提出が必要）　",
                                "車（免許証の提出が必要）　",
                                "社有車希望（週30時間以上勤務＋自宅近隣駐車場用意が条件　エントリー後詳細確認します）　"
                            ].map((option, idx) => (
                                <label key={idx} className="block text-sm">
                                    <input type="checkbox" name="commute" value={option} className="mr-2" />
                                    {option}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 6. 健康状態と注意事項 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">6. 健康状態<span className="text-red-500">*</span></h2>
                        <textarea
                            name="healthCondition"
                            rows={4}
                            placeholder="持病・障害・既往歴・就業上の配慮が必要な事項など"
                            style={{
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                padding: "12px",
                                resize: "vertical",
                                width: "90%",
                                boxSizing: "border-box",
                            }}
                            required
                        />
                        <p className="text-xs text-gray-600 mt-1">
                            ※就業後、勤務に影響する健康上の情報を申告されなかった場合、雇用契約の無効・解除の対象となることがあります。
                        </p>
                    </div>
                    {/* 7. 資格証明書 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">
                            7. 資格証明書
                            <span className="ml-2 text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                        </h2>
                        <p className="text-xs text-gray-600 -mt-1 mb-2">
                            PDF / 画像、各ファイル {MAX_FILE_MB}MB まで
                        </p>
                        {docMaster.certificate.map((label, idx) => (
                            <div key={idx} className="mb-3">
                                <label className="block text-sm font-medium">
                                    {label} <span className="text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                                </label>
                                <input
                                    type="file"
                                    name={`certificate_${idx}`}
                                    accept="image/*,.pdf"
                                    className="w-full border rounded p-2"
                                />

                            </div>
                        ))}
                    </div>

                    {/* 8. 身分証明書 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">
                            8. 身分証明書<span className="text-red-500">*</span>
                            <span className="ml-2 text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                        </h2>
                        <p className="text-sm text-gray-700 mb-2">
                            下記いずれか（免許証の場合には裏表が必要）を必ず提出してください。車での通勤を希望する方は免許証の表裏両面が必須です。
                        </p>
                        <p className="text-xs text-gray-600 -mt-1 mb-2">
                            PDF / 画像、各ファイル {MAX_FILE_MB}MB まで
                        </p>
                        <label className="block text-sm font-medium">
                            運転免許証（表） <span className="text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                        </label>
                        <input type="file" name="licenseFront" accept="image/*,.pdf" className="w-full border rounded p-2 mb-2" />
                        <label className="block text-sm font-medium">
                            運転免許証（裏） <span className="text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                        </label>
                        <input type="file" name="licenseBack" accept="image/*,.pdf" className="w-full border rounded p-2 mb-2" />
                        <label className="block text-sm font-medium">
                            住民票（任意・免許証がない場合） <span className="text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                        </label>
                        <input type="file" name="residenceCard" accept="image/*,.pdf" className="w-full border rounded p-2" />
                    </div>
                    {/* 9. 顔写真アップロード */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">
                            9. 顔写真アップロード
                            <span className="ml-2 text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                        </h2>
                        <p className="text-sm text-gray-700 mb-2">
                            面談・本人確認の参考として顔写真のアップロードをお願いしています（証明写真やスナップ写真でも可）。
                        </p>
                        <p className="text-xs text-gray-600 -mt-1 mb-2">
                            画像のみ、{MAX_FILE_MB}MB まで
                        </p>
                        <label className="block text-sm font-medium">
                            顔写真<span className="text-red-500">*</span>
                            <span className="ml-2 text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span>
                        </label>
                        <input type="file" name="photo" accept="image/*" className="w-full border rounded p-2" />
                    </div>
                    {/* 10. 確認事項・同意 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">10. 確認事項・同意<span className="text-red-500">*</span></h2>
                        <div className="space-y-2 text-sm text-gray-700">
                            <p>以下の内容をご確認のうえ、チェックを入れてください。</p>
                            <label className="block">
                                <input type="checkbox" name="agreeTerms" required className="mr-2" />
                                入力内容に虚偽がないことを確認しました。
                            </label>

                            <label className="block">
                                <input type="checkbox" name="agreePrivacy" required className="mr-2" />
                                プライバシーポリシーを読み、内容に同意します。
                            </label>
                            {/* 🔽 プライバシーポリシーへのリンク（別要素として） */}
                            <div className="pl-6 text-gray-500 text-xs">
                                <a
                                    href="https://shi-on.net/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline"
                                >
                                    プライバシーポリシーを表示
                                </a>
                            </div>
                        </div>
                    </div>
                    {/* 送信ボタン */}
                    <div className="text-center pt-6">
                        <button
                            type="submit"
                            className="button button-primary inline-flex items-center gap-2 disabled:opacity-50"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "送信中（1-2分かかる時があります）・・・" : "登録内容を送信する"}
                        </button>

                    </div>

                </form>
            </div>
            <Footer /> {/* ← フッターをここで表示 */}
        </main>
    );
}
