import { NextRequest, NextResponse } from "next/server";
import { DesignService } from "@/lib/services/design-service";
import { requireAuth } from "@/lib/auth";

export const dynamic = 'force-dynamic'

// GET /api/designs/categories - Get all categories
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    
    console.log("Fetching categories:", category ? `for category ${category}` : "all");

    let data: string[];
    if (category) {
      data = await DesignService.getSubcategories(category);
    } else {
      data = await DesignService.getCategories();
    }
    
    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
