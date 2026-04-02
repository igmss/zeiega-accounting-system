import { NextRequest } from "next/server"
import { PurchaseOrderService } from "@/lib/services/purchase-order-service"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"

// GET /api/purchase-orders - Get all purchase orders
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const vendorId = searchParams.get("vendorId") || undefined
        const status = searchParams.get("status") as any
        const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined

        const purchaseOrders = await PurchaseOrderService.getAllPurchaseOrders({ vendorId, status, limit })

        return createSuccessResponse(purchaseOrders, 200, { count: purchaseOrders.length })
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to fetch purchase orders")
    }
}

// POST /api/purchase-orders - Create a new purchase order
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        if (!body.vendor_id || !body.items?.length) {
            return createErrorResponse("vendor_id and items are required", 400)
        }

        const result = await PurchaseOrderService.createPurchaseOrder(
            body.vendor_id,
            body.items,
            {
                expectedDelivery: body.expected_delivery ? new Date(body.expected_delivery) : undefined,
                shippingAddress: body.shipping_address,
                shippingCost: body.shipping_cost,
                taxRate: body.tax_rate,
                notes: body.notes
            }
        )

        if (result.success) {
            return createSuccessResponse({ purchaseOrderId: result.purchaseOrderId }, 201)
        } else {
            return createErrorResponse(result.error || "Failed to create purchase order", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to create purchase order")
    }
}
