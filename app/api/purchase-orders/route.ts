import { NextRequest } from "next/server"
import { PurchaseOrderService } from "@/lib/services/purchase-order-service"
import { createSuccessResponse, createErrorResponse } from "@/lib/validation/helpers"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

// GET /api/purchase-orders - Get all purchase orders
export async function GET(request: NextRequest) {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response
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

// GET /api/purchase-orders/[id] - handled inline via ?id query
// (single PO lookup uses the GET above with searchParams)

// POST /api/purchase-orders - Create a new purchase order
export async function POST(request: NextRequest) {
    const auth = await requirePermission("purchase-orders:create")
    if (!auth.authorized) return auth.response
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

// PUT /api/purchase-orders - Update status (send/confirm/cancel)
export async function PUT(request: NextRequest) {
    const auth = await requirePermission("purchase-orders:create")
    if (!auth.authorized) return auth.response
    try {
        const body = await request.json()
        const { id, action } = body

        if (!id || !action) {
            return createErrorResponse("id and action are required", 400)
        }

        let result
        switch (action) {
            case "send":
                result = await PurchaseOrderService.sendPurchaseOrder(id)
                break
            case "confirm":
                result = await PurchaseOrderService.confirmPurchaseOrder(id)
                break
            case "receive":
                if (!body.items || body.items.length === 0) {
                    return createErrorResponse("Items are required for receiving goods", 400)
                }
                result = await PurchaseOrderService.receiveGoods({
                    purchase_order_id: id,
                    items: body.items,
                    receipt_date: new Date().toISOString().split("T")[0],
                    notes: body.notes
                })
                break
            case "pay":
                if (!body.amount || body.amount <= 0) {
                    return createErrorResponse("Payment amount is required", 400)
                }
                result = await PurchaseOrderService.payVendor(id, body.amount, body.method || "bank", body.reference)
                break
            case "cancel":
                result = await PurchaseOrderService.cancelPurchaseOrder(id, body.reason)
                break
            default:
                return createErrorResponse(`Unknown action: ${action}`, 400)
        }

        if (result.success) {
            return createSuccessResponse({ success: true })
        } else {
            return createErrorResponse(result.error || "Failed to update purchase order", 400)
        }
    } catch (error) {
        return createErrorResponse(error instanceof Error ? error.message : "Failed to update purchase order")
    }
}
