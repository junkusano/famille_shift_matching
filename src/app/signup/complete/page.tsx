// app/signup/complete/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type StatusType = "success" | "error" | "";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function SignupCompletePage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [statusType, setStatusType] = useState<StatusType>("");
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [linked, setLinked] = useState(false);
  const [isOAuthUser, setIsOAuthUser] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setStatusMsg("");
        setStatusType("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.push("/login");
          return;
        }

        const user = session.user;

        // 今回の判定方針:
        // identities の provider に email 以外があれば OAuth ユーザー扱い
        const providers = (user.identities ?? [])
          .map((i) => i.provider)
          .filter(Boolean);

        const oauthUser = providers.some((p) => p !== "email");
        setIsOAuthUser(oauthUser);

        const email = user.email;
        if (!email) {
          setStatusMsg("メール情報が取得できません。サポートに連絡してください。");
          setStatusType("error");
          return;
        }

        setLoading(true);

        // form_entries に該当メールがあるか確認
        const { data: entry, error: findErr } = await supabase
          .from("form_entries")
          .select("id,email,auth_uid")
          .eq("email", email)
          .maybeSingle();

        if (findErr) {
          setStatusMsg(`エラー: ${findErr.message}`);
          setStatusType("error");
          return;
        }

        if (!entry) {
          setStatusMsg(
            "このメールアドレスはエントリーに存在しません。エントリーメールでログインしてください。"
          );
          setStatusType("error");

          await supabase.auth.signOut();
          router.push("/login");
          return;
        }

        // auth_uid を紐付け
        // 既存値が違っていても、現在のログイン user.id にそろえる
        const { error: updateErr } = await supabase
          .from("form_entries")
          .update({ auth_uid: user.id })
          .eq("id", entry.id);

        if (updateErr) {
          setStatusMsg("認証情報の確認中にエラーが発生しました。サポートに連絡してください。");
          setStatusType("error");
          return;
        }

        setLinked(true);

        if (oauthUser) {
          setStatusMsg("認証が完了しました。ポータルへ進めます。");
        } else {
          setStatusMsg("初回ログインのため、パスワードを設定してください。");
        }
        setStatusType("success");
      } catch (e: unknown) {
        setStatusMsg(`エラー: ${errMsg(e)}`);
        setStatusType("error");
      } finally {
        setLoading(false);
        setSessionChecked(true);
      }
    };

    run();
  }, [router]);

  const handleSetPassword = async () => {
    if (!password || password.length < 10) {
      setStatusMsg("パスワードは10文字以上にしてください");
      setStatusType("error");
      return;
    }

    setLoading(true);
    setStatusMsg("");
    setStatusType("");

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setStatusMsg(`エラー: ${error.message}`);
      setStatusType("error");
      return;
    }

    setStatusMsg("パスワードが設定されました。ポータルへ移動します...");
    setStatusType("success");

    setTimeout(() => {
      router.push("/portal");
    }, 700);
  };

  if (!sessionChecked) {
    return <p className="p-4 text-center">認証確認中です...</p>;
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow space-y-4">
      <h1 className="text-xl font-bold">
        {linked ? (isOAuthUser ? "認証完了" : "初回ログイン設定") : "認証確認"}
      </h1>

      {statusMsg && (
        <p className={`text-sm ${statusType === "error" ? "text-red-500" : "text-green-600"}`}>
          {statusMsg}
        </p>
      )}

      {linked && isOAuthUser && (
        <>
          <p className="text-sm text-gray-600">
            OAuth認証ユーザーのため、パスワード設定なしでポータルへ進めます。
          </p>

          <button
            onClick={() => router.push("/portal")}
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition disabled:opacity-60"
          >
            {loading ? "処理中..." : "ポータルへ進む"}
          </button>
        </>
      )}

      {linked && !isOAuthUser && (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-600 mb-2">
            OAuthではないため、初回ログイン時にパスワード設定が必要です。
          </p>

          <input
            type="password"
            placeholder="新しいパスワード（10文字以上）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-2"
          />

          <button
            onClick={handleSetPassword}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-60"
          >
            {loading ? "設定中..." : "パスワードを設定して進む"}
          </button>
        </div>
      )}

      {!linked && statusType === "error" && (
        <button
          onClick={() => router.push("/login")}
          className="w-full bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition"
        >
          ログイン画面へ戻る
        </button>
      )}
    </div>
  );
}