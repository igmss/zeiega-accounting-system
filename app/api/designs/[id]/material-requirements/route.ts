import { NextRequest, NextResponse } from "next/server";
import { DesignService } from "@/lib/services/design-service";
import { requireAuth } from "@/lib/auth";

// GET /api/designs/[id]/material-requirements - Get material requirements for a design
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const quantity = parseInt(searchParams.get('quantity') || '1');

    console.log(`Getting material requirements for design ${params.id}, quantity: ${quantity}`);

    const requirements = await DesignService.getMaterialRequirements(params.id, quantity);
    const availability = await DesignService.checkMaterialAvailability(params.id, quantity);

    return NextResponse.json({
      success: true,
      data: {
        requirements,
        availability
      }
    });

  } catch (error) {
    console.error("Error getting material requirements:", error);
    return NextResponse.json(
      { error: "Failed to get material requirements" },
      { status: 500 }
    );
  }
}
