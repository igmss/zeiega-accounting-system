import { NextRequest, NextResponse } from "next/server";
import { DesignService } from "@/lib/services/design-service";
import { requirePermission, requireAuth } from "@/lib/auth";

// GET /api/designs/[id] - Get a single design
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const designId = params.id;
    
    console.log("Fetching design:", designId);

    const design = await DesignService.getDesign(designId);
    
    if (!design) {
      return NextResponse.json(
        { success: false, error: "Design not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: design
    });

  } catch (error) {
    console.error("Error fetching design:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PUT /api/designs/[id] - Update a design
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission("designs:create");
  if (!auth.authorized) return auth.response;

  try {
    const designId = params.id;
    const updates = await request.json();
    
    console.log("Updating design:", designId);

    await DesignService.updateDesign(designId, updates);
    
    return NextResponse.json({
      success: true,
      message: "Design updated successfully"
    });

  } catch (error) {
    console.error("Error updating design:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// DELETE /api/designs/[id] - Delete a design
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission("designs:create");
  if (!auth.authorized) return auth.response;

  try {
    const designId = params.id;
    
    console.log("Deleting design:", designId);

    await DesignService.deleteDesign(designId);
    
    return NextResponse.json({
      success: true,
      message: "Design deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting design:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
