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

  // ✅ entry と紐付いたか
  const [linked, setLinked] = useState(false);

  // ✅ OAuthっぽい（identity provider が email 以外）なら「パスワード設定は任意」にする
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

        // provider 判定（Supabaseは identities に provider が入る）
        const providers = (user.identities ?? []).map((i) => i.provider).filter(Boolean);
        setIsOAuthUser(providers.some((p) => p !== "email"));

        const email = user.email;
        if (!email) {
          setStatusMsg("メール情報が取得できません。サポートに連絡してください。");
          setStatusType("error");
          return;
        }

        // ✅ form_entries に該当メールがあるか確認 → auth_uid 更新（1件も無ければ弾く）
        setLoading(true);

        // まず存在確認（select）
        const { data: entry, error: findErr } = await supabase
          .from("form_entries")
          .select("id,email")
          .eq("email", email)
          .maybeSingle();

        if (findErr) {
          setStatusMsg(`エラー: ${findErr.message}`);
          setStatusType("error");
          return;
        }

        if (!entry) {
          // ＝ entry が無いメールで OAuth しちゃった
          setStatusMsg(
            "このメールアドレスはエントリーに存在しません。エントリーメールでログインしてください。"
          );
          setStatusType("error");

          // ここでサインアウトしてログイン画面へ戻す（事故防止）
          await supabase.auth.signOut();
          router.push("/login");
          return;
        }

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

        // OAuth の場合はパスワード不要なので、ここで成功メッセージだけ出す
        setStatusMsg("認証が完了しました。ポータルへ進めます。");
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
    } else {
      setStatusMsg("パスワードが設定されました。ポータルへ移動します...");
      setStatusType("success");
      setTimeout(() => {
        router.push("/portal");
      }, 700);
    }
  };

  if (!sessionChecked) {
    return <p className="p-4 text-center">認証確認中です...</p>;
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow space-y-3">
      <h1 className="text-xl font-bold">初回ログイン完了</h1>

      {statusMsg && (
        <p className={`text-sm ${statusType === "error" ? "text-red-500" : "text-green-600"}`}>
          {statusMsg}
        </p>
      )}

      {/* ✅ OAuthユーザーはパスワード不要：すぐポータルへ */}
      {linked && (
        <button
          onClick={() => router.push("/portal")}
          disabled={loading}
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition disabled:opacity-60"
        >
          {loading ? "処理中..." : "ポータルへ進む"}
        </button>
      )}

      {/* ✅ メール/パスワードでもログインしたい人向け（任意） */}
      {linked && (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-600 mb-2">
            {isOAuthUser
              ? "（任意）今後メール/パスワードでもログインしたい場合のみ、パスワードを設定してください。"
              : "新しいパスワードを設定してください。"}
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
            {loading ? "設定中..." : "パスワードを設定（任意）"}
          </button>
        </div>
      )}

      {/* 紐付け失敗時 */}
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
