import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { DesignService } from "@/lib/services/design-service";
import { requirePermission } from "@/lib/auth";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("designs:create");
  if (!auth.authorized) return auth.response;

  try {
    const secret = request.headers.get("x-cron-secret");
    const expected = process.env.CRON_SECRET;
    if (!secret || !expected || !safeCompare(secret, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Starting design size cost migration...");
    const result = await DesignService.migrateAllToSizeCosts();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
