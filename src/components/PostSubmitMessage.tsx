"use client";

import React, { useState } from "react";
import Link from "next/link";
import { staffContractLinks } from "@/lib/staffContractLinks";

import {
    CheckCircleIcon,
    EnvelopeIcon,
    HomeIcon,
} from "@heroicons/react/24/solid";


export default function PostSubmitMessage({ form }: { form: FormData }) {
    const isNoCert = form.get("noCertifications") === "on"

    const workStyles = form.getAll("workStyle") as string[]
    const isFulltimeHope = workStyles.some((w) =>
        w.includes("正社員を希望している")
    )

    const commuteOptions = form.getAll("commute") as string[]
    const wantsCompanyCar = commuteOptions.some((w) =>
        w.includes("社有車希望")
    )

    const interviewOnly = isNoCert || isFulltimeHope || wantsCompanyCar

    const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

    const handleSendEmail = async () => {
        setEmailStatus("sending");
        try {
            const res = await fetch("/api/remind-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: form.get("email"),
                    applicantName: `${form.get("lastNameKanji")} ${form.get("firstNameKanji")}`,
                }),
            });

            if (!res.ok) throw new Error("送信失敗");

            setEmailStatus("sent");
        } catch (err) {
            console.error("メール送信エラー:", err);
            setEmailStatus("error");
        }
    };



    return (
        <div className="p-8 bg-white max-w-3xl mx-auto space-y-6 text-gray-800">
            <h2 className="text-2xl font-bold text-green-700">送信ありがとうございました！</h2>

            {interviewOnly ? (
                <div className="space-y-2">
                    <p>
                        ご登録内容を確認の上、<strong>採用担当者からのご連絡を差し上げます。</strong>
                    </p>
                    <p>
                        しばらくお待ちいただきますよう、よろしくお願いいたします。
                    </p>
                    <Link href="/" className="button button-muted inline-flex items-center gap-2">
                        <HomeIcon className="w-5 h-5" /> ホームに戻る
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    <p>
                        以下の電子契約を完了いただくことで、エントリーが完了となります。
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-sm">
                        <li>
                            <a
                                href={staffContractLinks.employment}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline inline-flex items-center gap-1"
                            >
                                <CheckCircleIcon className="w-4 h-4" /> 雇用契約書（電子サイン）
                            </a>
                        </li>
                        <li>
                            <a
                                href={staffContractLinks.privacy}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline inline-flex items-center gap-1"
                            >
                                <CheckCircleIcon className="w-4 h-4" /> 秘密保持・個人情報同意書（電子サイン）
                            </a>
                        </li>
                        <li>
                            <a
                                href={staffContractLinks.privateCar}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline inline-flex items-center gap-1"
                            >
                                <CheckCircleIcon className="w-4 h-4" /> 私有車誓約書（私有車を業務で使用する方のみ）
                            </a>
                        </li>
                    </ul>
                    <p>上記電子サイン完了後、ファミーユの採用担当者から、社内システムログイン等のご連絡を致します。</p>
                    {/* ✅ YouTube動画を埋め込む */}
                    <div className="mt-10">
                        <h2 className="text-lg font-semibold mb-2">雇用契約書について</h2>
                        <p className="text-sm text-gray-700 mb-3">
                            以下の動画で、電子サインの手順をご確認いただけます。
                        </p>
                        <iframe
                            width="930"
                            height="523"
                            src="https://www.youtube.com/embed/aOWp6dtvVTo"
                            title="電子サインの方法（雇用契約書）"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                            className="w-full max-w-full rounded"
                        ></iframe>
                    </div>

                    <div className="flex gap-4 pt-4 items-center flex-wrap">
                        <button
                            type="button"
                            onClick={handleSendEmail}
                            className="button button-secondary inline-flex items-center gap-2 disabled:opacity-50"
                            disabled={emailStatus === "sending"}
                        >
                            <EnvelopeIcon className="w-5 h-5" />
                            {emailStatus === "sending" ? "送信中..." : "メールで確認リンクを送る"}
                        </button>

                        {emailStatus === "sent" && (
                            <span className="text-green-600 text-sm">メール送信しました！</span>
                        )}
                        {emailStatus === "error" && (
                            <span className="text-red-600 text-sm">送信に失敗しました。再試行してください。</span>
                        )}

                        <Link
                            href="/"
                            className="button button-muted inline-flex items-center gap-2"
                        >
                            <HomeIcon className="w-5 h-5" />
                            ホームに戻る
                        </Link>
                    </div>

                </div>
            )}
        </div>
    )
}