import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "code がありません" }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.append("code", code);
  params.append("client_id", process.env.GOOGLE_CLIENT_ID || "");
  params.append("client_secret", process.env.GOOGLE_CLIENT_SECRET || "");
  params.append("redirect_uri", "https://myfamille.shi-on.net/api/auth/callback");
  params.append("grant_type", "authorization_code");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json({ error: "トークン取得失敗", detail: tokenData }, { status: 500 });
    }

    // ✅ トークンをURLに含めて /entry にリダイレクト
    const redirectUrl = new URL("https://myfamille.shi-on.net/entry");
    redirectUrl.searchParams.set("token", tokenData.access_token);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    return NextResponse.json({ error: "トークン取得中に例外", detail: String(error) }, { status: 500 });
  }
}
