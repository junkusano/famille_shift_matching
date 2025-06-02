"use client";

import React, { useState, useEffect } from "react"; // ←ここ重要！
import { supabase } from "@/lib/supabase";
import PostSubmitMessage from "@/components/PostSubmitMessage";
import { HomeIcon } from "@heroicons/react/24/solid";

export default function EntryPage() {

    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState<FormData | null>(null);

    const [postalCode, setPostalCode] = useState("");
    const [address, setAddress] = useState(""); // ←住所欄に反映する

    const fetchAddressFromPostalCode = async () => {
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
    };

    useEffect(() => {
        if (postalCode.length === 7) {
            fetchAddressFromPostalCode(postalCode);
        }
    }, [postalCode]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setIsSubmitting(true); // ← 送信開始

        // --- ファイル取得 ---
        const licenseFront = form.get("licenseFront") as File;
        const licenseBack = form.get("licenseBack") as File;
        const residenceCard = form.get("residenceCard") as File;
        const photoFile = form.get("photo") as File;

        // --- バリデーション ---
        const requiredFields = [
            "lastNameKanji", "firstNameKanji", "lastNameKana", "firstNameKana",
            "birthYear", "birthMonth", "birthDay", "postalCode", "address",
            "phone", "email", "motivation", "healthCondition"
        ];

        for (const name of requiredFields) {
            if (!form.get(name)) {
                alert("すべての必須項目を入力してください。");
                return;
            }
        }

        if (!photoFile || photoFile.size === 0) {
            alert("顔写真のアップロードは必須です。");
            return;
        }

        const hasLicenseFront = licenseFront?.size > 0;
        const hasLicenseBack = licenseBack?.size > 0;
        const hasResidenceCard = residenceCard?.size > 0;
        const hasValidId = (hasLicenseFront && hasLicenseBack) || hasResidenceCard;

        if (!hasValidId) {
            alert("免許証（表裏両方）または住民票のいずれかをアップロードしてください。");
            return;
        }

        const noCert = form.get("noCertifications") === "on";
        const hasCert = Array.from({ length: 13 }, (_, i) => form.get(`certificate_${i}`) as File)
            .some(file => file && file.size > 0);

        if (!noCert && !hasCert) {
            alert("資格証明書を1つ以上アップロードするか、資格なしにチェックしてください。");
            return;
        }

        // --- ファイルアップロード関数 ---
        async function uploadFile(key: string, file: File | null) {
            if (!file || file.size === 0) return null;
            const safeName = file.name.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
            const filename = `${key}/${Date.now()}_${safeName}`;
            const { data, error } = await supabase.storage.from("uploads").upload(filename, file);
            if (error) {
                console.error(`${key} アップロード失敗:`, error.message);
                return null;
            }
            return supabase.storage.from("uploads").getPublicUrl(data.path).data.publicUrl;
        }

        // --- 各ファイルアップロード ---
        const licenseFrontUrl = await uploadFile("licenseFront", licenseFront);
        const licenseBackUrl = await uploadFile("licenseBack", licenseBack);
        const photoUrl = await uploadFile("photo", photoFile);

        const certificationUrls: string[] = [];
        for (let i = 0; i < 13; i++) {
            const certFile = form.get(`certificate_${i}`) as File;
            const certUrl = await uploadFile(`certificate_${i}`, certFile);
            if (certUrl) certificationUrls.push(certUrl);
        }

        // --- Supabase 登録 ---
        const payload = {
            last_name_kanji: form.get("lastNameKanji"),
            first_name_kanji: form.get("firstNameKanji"),
            motivation: form.get("motivation"),
            workstyle_other: form.get("workStyleOther"),
            commute_options: form.getAll("commute") as string[],
            certifications: [], // あとで登録してもOK
            health_condition: form.get("healthCondition"),
            agreed_terms: form.get("agreeTerms") === "on",
            agreed_privacy: form.get("agreePrivacy") === "on",
            license_front_url: licenseFrontUrl,
            license_back_url: licenseBackUrl,
            photo_url: photoUrl,
            postal_code: postalCode,
            address: address,
        };

        const { error } = await supabase.from("form_entries").insert([payload]);

        if (error) {
            console.error("送信失敗:", error.message);
            alert("送信に失敗しました");
            return;
        }

        // --- メール送信 ---
        try {
            const res = await fetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applicantName: `${form.get("lastNameKanji")} ${form.get("firstNameKanji")}`,
                    email: form.get("email"),
                    phone: form.get("phone"),
                    postal_code: postalCode,
                    address: address,
                    motivation: form.get("motivation"),
                    workstyle_other: form.get("workStyleOther"),
                    commute_options: form.getAll("commute"),
                    health_condition: form.get("healthCondition"),
                    photo_url: photoUrl,
                    license_front_url: licenseFrontUrl,
                    license_back_url: licenseBackUrl,
                    certification_urls: certificationUrls,
                }),
            });

            const result = await res.json();
            console.log("メール送信レスポンス:", result);

            if (!res.ok) {
                console.error("メール送信エラー:", result);
                alert("メール通知に失敗しました（採用担当への連絡は手動でお願いします）");
            }
        } catch (err) {
            console.error("fetchエラー:", err);
            alert("予期しないエラーが発生しました（メール通知に失敗）");
        } finally {
            setIsSubmitting(false); // ← 成功・失敗問わず解除
        }

        // --- 完了処理 ---
        setFormData(form);
        setSubmitted(true);
    }


    if (submitted && formData) {
        return <PostSubmitMessage form={formData} />;
    }


    return (
        <main className="min-h-screen bg-famille text-gray-800 px-4 py-10">
            <div className="max-w-[1600px] mx-auto bg-white p-8 rounded shadow space-y-8">

                <div className="text-right">
                    <a
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-gray-600 underline hover:text-blue-600"
                    >
                        <HomeIcon className="w-5 h-5" />
                        ホームに戻る
                    </a>
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
                        <h2 className="text-lg font-semibold mb-2">3. 志望動機</h2>
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
                                minWidth: "70%",
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
                                    width: "70%",
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
                                width: "70%",
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
                        <h2 className="text-lg font-semibold mb-2">7. 資格証明書<span className="text-red-500">*</span></h2>
                        <label className="block text-sm mb-2">
                            <input type="checkbox" name="noCertifications" className="mr-2" />
                            介護に関する資格証を現在所持していない（エントリー後、採用面接のフローに進みます）
                        </label>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium">
                                所持している資格証明書をアップロードしてください（該当するもののみ）。
                            </label>
                            {[
                                "介護福祉士",
                                "実務者研修終了",
                                "初任者研修（ヘルパー2級）",
                                "正看護師",
                                "准看護師",
                                "同行援護資格",
                                "行動援護（高度行動障害）資格",
                                "2年以上の障害児・障害者サービス実施経験証明書",
                                "1年以上の障害児・障害者サービス実施経験証明書",
                                "その他介護に関する資格証明書①",
                                "その他介護に関する資格証明書②",
                                "その他介護に関する資格証明書③"
                            ].map((label, idx) => (
                                <div key={idx}>
                                    <label className="block text-sm font-medium">{label}</label>
                                    <input
                                        type="file"
                                        name={`certificate_${idx}`}
                                        accept="image/*,.pdf"
                                        className="w-full border rounded p-2"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 8. 身分証明書 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">8. 身分証明書<span className="text-red-500">*</span></h2>
                        <p className="text-sm text-gray-700 mb-2">
                            下記いずれか（免許証の場合には裏表が必要）を必ず提出してください。車での通勤を希望する方は免許証の表裏両面が必須です。
                        </p>
                        <label className="block text-sm font-medium">運転免許証（表）</label>
                        <input type="file" name="licenseFront" accept="image/*,.pdf" className="w-full border rounded p-2 mb-2" />
                        <label className="block text-sm font-medium">運転免許証（裏）</label>
                        <input type="file" name="licenseBack" accept="image/*,.pdf" className="w-full border rounded p-2 mb-2" />
                        <label className="block text-sm font-medium">住民票（任意・免許証がない場合）</label>
                        <input type="file" name="residenceCard" accept="image/*,.pdf" className="w-full border rounded p-2" />
                    </div>
                    {/* 9. 顔写真アップロード */}
                    <div>
                        <h2 className="text-lg font-semibold mb-2">9. 顔写真アップロード</h2>
                        <p className="text-sm text-gray-700 mb-2">
                            面談・本人確認の参考として顔写真のアップロードをお願いしています（証明写真やスナップ写真でも可）。
                        </p>
                        <label className="block text-sm font-medium">顔写真<span className="text-red-500">*</span></label>
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
                        </div>
                    </div>
                    {/* 送信ボタン */}
                    <div className="text-center pt-6">
                        <button
                            type="submit"
                            className="button button-primary inline-flex items-center gap-2 disabled:opacity-50"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "送信中..." : "登録内容を送信する"}
                        </button>

                    </div>

                </form>
            </div>
        </main>
    );
}
