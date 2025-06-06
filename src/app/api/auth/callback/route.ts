// src/app/api/auth/callback/route.ts

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  console.log("OAuth認可コード:", code);

  return NextResponse.json({
    message: "認可コードを受信しました",
    code,
  });
}
