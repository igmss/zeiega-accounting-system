import { NextRequest } from "next/server"
import { VendorService } from "@/lib/services/vendor-service"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"

// GET /api/vendors - Get all vendors
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const status = searchParams.get("status") as "active" | "inactive" | undefined
        const search = searchParams.get("search") || undefined
        const minRating = searchParams.get("minRating") ? parseFloat(searchParams.get("minRating")!) : undefined

        const vendors = await VendorService.getAllVendors({ status, search, minRating })

        return createSuccessResponse(vendors, 200, { count: vendors.length })
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to fetch vendors")
    }
}

// POST /api/vendors - Create a new vendor
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        if (!body.name) {
            return createErrorResponse("Vendor name is required", 400)
        }

        const result = await VendorService.createVendor({
            name: body.name,
            contact_name: body.contact_name,
            email: body.email,
            phone: body.phone,
            address: body.address,
            payment_terms: body.payment_terms,
            lead_time_days: body.lead_time_days,
            notes: body.notes,
            status: body.status || "active"
        })

        if (result.success) {
            return createSuccessResponse({ vendorId: result.vendorId }, 201)
        } else {
            return createErrorResponse(result.error || "Failed to create vendor", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to create vendor")
    }
}
