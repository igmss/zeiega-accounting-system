import { NextRequest, NextResponse } from "next/server"
import { BOMService } from "@/lib/services/bom-service"
import { validateRequestBody, createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { bomSchema } from "@/lib/validation/schemas"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

// GET /api/bom - Get all BOMs
export async function GET(request: NextRequest) {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response
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
    const auth = await requirePermission("bom:create")
    if (!auth.authorized) return auth.response
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

// PUT /api/bom - Update or activate a BOM
export async function PUT(request: NextRequest) {
    const auth = await requirePermission("bom:create")
    if (!auth.authorized) return auth.response
    try {
        const body = await request.json()
        const { id, action, ...updates } = body

        if (!id) return createErrorResponse("BOM ID is required", 400)

        let result
        if (action === "activate") {
            result = await BOMService.activateBOM(id)
        } else if (action === "archive") {
            result = await BOMService.updateBOM(id, { status: "archived" })
        } else {
            result = await BOMService.updateBOM(id, updates)
        }

        if (result.success) {
            return createSuccessResponse({ success: true })
        } else {
            return createErrorResponse(result.error || "Failed to update BOM", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to update BOM")
    }
}

// DELETE /api/bom - Delete a BOM
export async function DELETE(request: NextRequest) {
    const auth = await requirePermission("bom:create")
    if (!auth.authorized) return auth.response
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get("id")
        if (!id) return createErrorResponse("BOM ID is required", 400)

        const result = await BOMService.deleteBOM(id)

        if (result.success) {
            return createSuccessResponse({ success: true })
        } else {
            return createErrorResponse(result.error || "Failed to delete BOM", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to delete BOM")
    }
}
