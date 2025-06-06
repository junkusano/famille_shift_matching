// app/api/auth/callback/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  console.log("OAuth認可コード:", code); // 後で curl で使う！

  return NextResponse.json({
    message: "コード受信成功。コンソールで確認してください。",
    code,
  });
}
