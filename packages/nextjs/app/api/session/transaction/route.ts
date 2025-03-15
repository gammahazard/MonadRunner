// This file is now deprecated - using proxy/transaction/route.ts instead
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json(
    { 
      error: "This endpoint is deprecated. Please use /api/session/proxy/transaction instead.",
      redirectTo: "/api/session/proxy/transaction"
    }, 
    { status: 301 }
  );
}