// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

// 乱数の簡易ID（外部ライブラリ不要）
function makeReqId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { pathname } = req.nextUrl;
  const reqId = makeReqId();

  // リクエストログ（元の機能を維持）
  console.log(
    `[REQ ${reqId}] ${req.method} ${pathname}${req.nextUrl.search} ` +
      `ua="${req.headers.get("user-agent") ?? "-"}" ` +
      `ip="${req.headers.get("x-forwarded-for") ?? "-"}"`
  );

  // x-request-id ヘッダ付与（元の機能を維持）
  res.headers.set("x-request-id", reqId);

  // ✅ セッション確立（cookie更新のため）- 必ず最初に呼ぶ
  await supabase.auth.getSession();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ✅ public paths（ログインなしで通す）
  const publicPrefixes = [
    "/login",
    "/signup",
    "/signup/complete",
    "/entry",
    "/auth/callback",
    "/unauthorized",
    "/_next",
    "/favicon.ico",
  ];
  if (
    publicPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return res;
  }

  // ★ Cron/内部バッチは素通り
  if (pathname.startsWith("/api/cron/")) return res;

  // ★ RPA用APIはスキップ（APIキー認証を使用）
  if (pathname.startsWith("/api/cm/rpa")) return res;

  // ★ /api/cm/ はログイン必須
  if (pathname.startsWith("/api/cm/")) {
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "認証が必要です" },
        { status: 401 }
      );
    }
    return res;
  }

  // ★ それ以外の /api はログイン必須
  if (pathname.startsWith("/api/")) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return res;
  }

  // ==============================
  // 🔸 /portal（訪問介護用）
  // ==============================
  if (pathname.startsWith("/portal")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const { data: profile, error } = await supabase
      .from("users")
      .select("system_role, service_type")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    if (profile.service_type === "kyotaku") {
      return NextResponse.redirect(new URL("/cm-portal", req.url));
    }

    const adminOnlyPaths = [
      "/portal/entry-list",
      "/portal/entry-detail",
      "/portal/rpa_requests",
      "/portal/rpa_temp",
    ];

    const isAdminPath = adminOnlyPaths.some((path) => pathname.startsWith(path));

    if (isAdminPath) {
      if (!["admin", "manager"].includes(profile.system_role)) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    return res;
  }

  // ==============================
  // 🔸 /cm-portal（居宅介護支援用）
  // ==============================
  if (pathname.startsWith("/cm-portal")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const { data: profile, error } = await supabase
      .from("users")
      .select("service_type")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    if (profile.service_type === "houmon_kaigo") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }

    if (!["kyotaku", "both"].includes(profile.service_type ?? "")) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    return res;
  }

  return res;
}

// 不要なものを除外（静的ファイルや画像など）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};