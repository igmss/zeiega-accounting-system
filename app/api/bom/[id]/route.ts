import { NextRequest, NextResponse } from "next/server"
import { BOMService } from "@/lib/services/bom-service"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { requirePermission, requireAuth } from "@/lib/auth"

// GET /api/bom/[id] - Get a single BOM
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const bom = await BOMService.getBOM(params.id)

        if (!bom) {
            return createErrorResponse("BOM not found", 404)
        }

        return createSuccessResponse(bom)
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to fetch BOM")
    }
}

// PUT /api/bom/[id] - Update a BOM
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requirePermission("bom:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()

        const result = await BOMService.updateBOM(params.id, body)

        if (result.success) {
            return createSuccessResponse({ message: "BOM updated successfully" })
        } else {
            return createErrorResponse(result.error || "Failed to update BOM", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to update BOM")
    }
}

// DELETE /api/bom/[id] - Delete a BOM
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requirePermission("bom:create")
        if (!auth.authorized) return auth.response

        const result = await BOMService.deleteBOM(params.id)

        if (result.success) {
            return createSuccessResponse({ message: "BOM deleted successfully" })
        } else {
            return createErrorResponse(result.error || "Failed to delete BOM", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to delete BOM")
    }
}
