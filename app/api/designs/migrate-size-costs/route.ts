import { NextRequest, NextResponse } from "next/server";
import { DesignService } from "@/lib/services/design-service";
import { requirePermission, requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("designs:create");
  if (!auth.authorized) return auth.response;

  try {
    const secret = request.headers.get("x-cron-secret") || request.headers.get("x-webhook-secret");
    const expected = process.env.CRON_SECRET || process.env.WEBHOOK_SECRET;
    if (!secret || secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Starting design size cost migration...");
    const result = await DesignService.migrateAllToSizeCosts();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
