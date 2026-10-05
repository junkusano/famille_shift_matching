import { NextResponse } from "next/server";

// Boundary guard: this nested Next.js project must never inherit the parent
// Famille application's authentication proxy during local or Vercel builds.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/__famille_mcp_boundary_guard__"],
};
