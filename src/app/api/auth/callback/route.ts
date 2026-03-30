//api/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/env/getAppBaseUrl";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "code がありません" }, { status: 400 });
  }

  const appBaseUrl = getAppBaseUrl();

  const params = new URLSearchParams();
  params.append("code", code);
  params.append("client_id", process.env.GOOGLE_CLIENT_ID || "");
  params.append("client_secret", process.env.GOOGLE_CLIENT_SECRET || "");
  params.append("redirect_uri", `${appBaseUrl}/api/auth/callback`);
  params.append("grant_type", "authorization_code");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: "token exchange failed", detail: tokenData },
        { status: 400 }
      );
    }

    const redirectUrl = new URL("/entry", req.url);
    redirectUrl.searchParams.set("token", tokenData.access_token);

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "unexpected error" }, { status: 500 });
  }
}