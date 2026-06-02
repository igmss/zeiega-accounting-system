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
            case "update": {
                if (!body.vendor_id || !body.items?.length) {
                    return createErrorResponse("vendor_id and items are required", 400)
                }
                const po = await PurchaseOrderService.getPurchaseOrder(id)
                if (!po) {
                    return createErrorResponse("Purchase order not found", 404)
                }
                if (po.status !== "draft") {
                    return createErrorResponse("Only draft purchase orders can be edited", 400)
                }
                
                const processedItems = body.items.map((item: any) => ({
                    ...item,
                    item_type: item.item_type || "inventory_raw",
                    total_cost: item.quantity * item.unit_cost,
                    received_quantity: 0
                }))
                const subtotal = processedItems.reduce((sum: number, item: any) => sum + item.total_cost, 0)
                const taxRate = body.tax_rate ?? 0.14
                const taxAmount = subtotal * taxRate
                const shippingCost = body.shipping_cost ?? 0
                const totalAmount = subtotal + taxAmount + shippingCost

                const { getServiceClient, TABLES } = await import("@/lib/supabase")
                const updateData = {
                    vendor_id: body.vendor_id,
                    items: processedItems,
                    subtotal,
                    tax_amount: taxAmount,
                    shipping_cost: shippingCost,
                    total_amount: totalAmount,
                    expected_delivery: body.expected_delivery ? new Date(body.expected_delivery).toISOString().split("T")[0] : null,
                    shipping_address: body.shipping_address || null,
                    notes: body.notes || null,
                    updated_at: new Date().toISOString()
                }
                
                const { error: updateErr } = await getServiceClient()
                    .from(TABLES.PURCHASE_ORDERS)
                    .update(updateData)
                    .eq("id", id)

                if (updateErr) {
                    return createErrorResponse(updateErr.message, 400)
                }
                result = { success: true }
                break
            }
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
