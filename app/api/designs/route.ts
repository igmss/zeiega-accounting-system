import { NextRequest, NextResponse } from "next/server";
import { DesignService } from "@/lib/services/design-service";
import type { DesignFilter } from "@/lib/types/designs";
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers";

// GET /api/designs - Get all designs with optional filtering
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    console.log("Starting designs API request...");
    
    const { searchParams } = new URL(request.url);
    
    // Parse filter parameters
    const filter: DesignFilter = {};
    if (searchParams.get('category')) filter.category = searchParams.get('category')!;
    if (searchParams.get('subcategory')) filter.subcategory = searchParams.get('subcategory')!;
    if (searchParams.get('status')) filter.status = searchParams.get('status') as any;
    if (searchParams.get('complexity')) filter.complexity = searchParams.get('complexity') as any;
    if (searchParams.get('minCost')) filter.minCost = parseFloat(searchParams.get('minCost')!);
    if (searchParams.get('maxCost')) filter.maxCost = parseFloat(searchParams.get('maxCost')!);
    if (searchParams.get('minMargin')) filter.minMargin = parseFloat(searchParams.get('minMargin')!);
    if (searchParams.get('maxMargin')) filter.maxMargin = parseFloat(searchParams.get('maxMargin')!);

    // Parse pagination parameters
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const lastDocId = searchParams.get('lastDocId');

    console.log("Fetching designs with filter:", filter, "pageSize:", pageSize, "lastDocId:", lastDocId);

    const result = await DesignService.getDesigns(filter, lastDocId || undefined, pageSize);
    
    console.log("Successfully fetched designs:", result.designs.length);
    
    return NextResponse.json({
      success: true,
      data: result.designs,
      pagination: {
        hasMore: result.hasMore,
        lastDocId: result.lastDoc?.id
      }
    });

  } catch (error) {
    console.error("Error fetching designs:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// POST /api/designs - Create a new design
export async function POST(request: NextRequest) {
  const auth = await requirePermission("designs:create")
  if (!auth.authorized) return auth.response
  try {
    const designData = await request.json();
    
    console.log("Creating new design:", designData.name);

    const designId = await DesignService.createDesign(designData);
    
    return NextResponse.json({
      success: true,
      data: { id: designId },
      message: "Design created successfully"
    });

  } catch (error) {
    console.error("Error creating design:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
