"use client";

import { type FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const MIN_PASSWORD_LENGTH = 10;

type Message = {
  kind: "error" | "success";
  text: string;
} | null;

export default function PortalPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? "");
      setCheckingSession(false);
    };

    void checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage({
        kind: "error",
        text: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`,
      });
      return;
    }

    if (password !== confirmation) {
      setMessage({
        kind: "error",
        text: "確認用パスワードが一致しません。",
      });
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({ password });

    setSaving(false);

    if (error) {
      const requiresRecentLogin =
        error.message.toLowerCase().includes("reauthentication") ||
        error.message.toLowerCase().includes("reauthenticate");

      setMessage({
        kind: "error",
        text: requiresRecentLogin
          ? "安全確認のため、Googleでログインし直してからもう一度お試しください。"
          : "パスワードを設定できませんでした。時間をおいて再度お試しください。",
      });
      return;
    }

    setPassword("");
    setConfirmation("");
    setMessage({
      kind: "success",
      text: "パスワードを設定しました。Famille Voiceでこのメールアドレスとパスワードを使用できます。",
    });
  };

  if (checkingSession) {
    return <div className="p-6 text-center text-sm text-slate-600">ログイン情報を確認しています...</div>;
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={() => router.push("/portal")}
        className="mb-4 text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
      >
        ← ポータルHomeへ戻る
      </button>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <KeyRound aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Famille Voice用パスワード設定</h1>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Googleのシングルサインオンを利用中の方も、ここでパスワードを設定できます。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">ログインID</p>
          <p className="mt-1 break-all text-sm font-semibold text-slate-900">{email}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="new-password" className="text-sm font-semibold text-slate-800">
              新しいパスワード
            </label>
            <div className="relative mt-1.5">
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-12 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder={`${MIN_PASSWORD_LENGTH}文字以上`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示する"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
              >
                {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="text-sm font-semibold text-slate-800">
              新しいパスワード（確認）
            </label>
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="もう一度入力してください"
            />
          </div>

          {message && (
            <div
              role={message.kind === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                message.kind === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {message.kind === "success" && (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "設定しています..." : "パスワードを設定する"}
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-slate-500">
          パスワード設定後も、MyFamilleにはこれまでどおりGoogleでログインできます。パスワードはMyFamilleの画面やデータベースには保存されません。
        </p>
      </section>
    </main>
  );
}
