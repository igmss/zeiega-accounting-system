import { NextRequest } from "next/server"
import { PurchaseOrderService } from "@/lib/services/purchase-order-service"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { requirePermission, requireAuth } from "@/lib/auth"

// GET /api/purchase-orders/[id] - Get a single purchase order
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const po = await PurchaseOrderService.getPurchaseOrder(params.id)

        if (!po) {
            return createErrorResponse("Purchase order not found", 404)
        }

        return createSuccessResponse(po)
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to fetch purchase order")
    }
}

// PUT /api/purchase-orders/[id] - Update purchase order status
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const auth = await requirePermission("purchase-orders:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { action } = body

        let result

        switch (action) {
            case "send":
                result = await PurchaseOrderService.sendPurchaseOrder(params.id)
                break
            case "confirm":
                result = await PurchaseOrderService.confirmPurchaseOrder(params.id)
                break
            case "receive":
                if (!body.items || body.items.length === 0) {
                    return createErrorResponse("Items are required for receiving goods", 400)
                }
                result = await PurchaseOrderService.receiveGoods({
                    purchase_order_id: params.id,
                    items: body.items,
                    receipt_date: new Date().toISOString(),
                    notes: body.notes
                })
                break
            case "cancel":
                result = await PurchaseOrderService.cancelPurchaseOrder(params.id, body.reason)
                break
            default:
                return createErrorResponse("Invalid action. Use: send, confirm, receive, or cancel", 400)
        }

        if (result.success) {
            return createSuccessResponse({ message: `Purchase order ${action} successful` })
        } else {
            return createErrorResponse(result.error || `Failed to ${action} purchase order`, 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to update purchase order")
    }
}
