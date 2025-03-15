// This file is now deprecated - using proxy/revoke/route.ts instead
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json(
    { 
      error: "This endpoint is deprecated. Please use /api/session/proxy/revoke instead.",
      redirectTo: "/api/session/proxy/revoke"
    }, 
    { status: 301 }
  );
}