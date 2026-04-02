import { NextRequest, NextResponse } from "next/server"
import { BOMService } from "@/lib/services/bom-service"
import { validateRequestBody, createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { bomSchema } from "@/lib/validation/schemas"

// GET /api/bom - Get all BOMs
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const designId = searchParams.get("designId") || undefined
        const status = searchParams.get("status") as "draft" | "active" | "archived" | undefined
        const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined

        const boms = await BOMService.getAllBOMs({ designId, status, limit })

        return createSuccessResponse(boms, 200, { count: boms.length })
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to fetch BOMs")
    }
}

// POST /api/bom - Create a new BOM
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const { design_id, name, items, labor_hours, notes } = body

        if (!design_id || !name || !items?.length) {
            return createErrorResponse("design_id, name, and items are required", 400)
        }

        const result = await BOMService.createBOM(
            design_id,
            name,
            items,
            labor_hours || 0,
            body.labor_rate || 50,
            body.overhead_percentage || 15,
            notes
        )

        if (result.success) {
            return createSuccessResponse({ bomId: result.bomId }, 201)
        } else {
            return createErrorResponse(result.error || "Failed to create BOM", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to create BOM")
    }
}
