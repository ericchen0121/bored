import { NextRequest, NextResponse } from "next/server";
import { resolveSearchQuery } from "@/lib/search-redirect";
import { siteUrl } from "@/lib/site";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const path = resolveSearchQuery(q);
  return NextResponse.redirect(`${siteUrl()}${path}`);
}
