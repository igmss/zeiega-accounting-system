import { NextRequest } from "next/server"
import { VendorService } from "@/lib/services/vendor-service"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"

// GET /api/vendors/[id] - Get a single vendor
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const vendor = await VendorService.getVendor(params.id)

        if (!vendor) {
            return createErrorResponse("Vendor not found", 404)
        }

        return createSuccessResponse(vendor)
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to fetch vendor")
    }
}

// PUT /api/vendors/[id] - Update a vendor
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await request.json()

        const result = await VendorService.updateVendor(params.id, body)

        if (result.success) {
            return createSuccessResponse({ message: "Vendor updated successfully" })
        } else {
            return createErrorResponse(result.error || "Failed to update vendor", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to update vendor")
    }
}

// DELETE /api/vendors/[id] - Deactivate a vendor
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const result = await VendorService.deactivateVendor(params.id)

        if (result.success) {
            return createSuccessResponse({ message: "Vendor deactivated successfully" })
        } else {
            return createErrorResponse(result.error || "Failed to deactivate vendor", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to deactivate vendor")
    }
}
