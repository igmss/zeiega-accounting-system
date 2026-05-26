import { NextRequest, NextResponse } from "next/server";
import { DesignService } from "@/lib/services/design-service";
import { requireAuth } from "@/lib/auth";

export const dynamic = 'force-dynamic'

// GET /api/designs/stats - Get design statistics
export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    console.log("Fetching design statistics");

    const stats = await DesignService.getDesignStats();
    
    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error("Error fetching design stats:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
