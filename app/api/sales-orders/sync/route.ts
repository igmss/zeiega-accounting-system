import { NextResponse } from "next/server"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { requirePermission } from "@/lib/auth/auth-helpers"

export const dynamic = "force-dynamic"

/**
 * POST /api/sales-orders/sync
 * Manually trigger live synchronization of unprocessed website orders
 */
export async function POST() {
  const auth = await requirePermission("sales-orders:create")
  if (!auth.authorized) return auth.response

  try {
    console.log("Triggering user-requested live synchronization of website orders...")
    
    // Execute the real, idempotent sync logic
    const result = await EnhancedAccountingService.syncWebsiteOrders()

    return NextResponse.json({
      success: true,
      processed: result.processed.length,
      created_sales_orders: result.processed.length, // Each processed website order creates one sales order
      created_work_orders: result.processed.length, // Corresponding work orders are generated automatically for processing/producing status
      errors: result.errors,
    })
  } catch (error) {
    console.error("Error executing manual order synchronization:", error)
    return NextResponse.json(
      { error: "Failed to synchronize website orders" },
      { status: 500 }
    )
  }
}
