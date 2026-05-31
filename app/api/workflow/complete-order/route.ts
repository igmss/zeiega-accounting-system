import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth/auth-helpers"

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requirePermission("work-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const { orderId } = await request.json()
    const serviceDb = getServiceClient()

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      )
    }

    let orderData: any = null
    let orderSource: string | null = null

    const { data: manualOrder } = await serviceDb
      .from(TABLES.MANUAL_ORDERS)
      .select("*")
      .eq("id", orderId)
      .single()

    if (manualOrder) {
      orderData = manualOrder
      orderSource = "manual_orders"
    } else {
      const { data: webOrder } = await serviceDb
        .from(TABLES.ORDERS)
        .select("*")
        .eq("id", orderId)
        .single()

      if (webOrder) {
        orderData = webOrder
        orderSource = "orders"
      } else {
        const { data: salesOrder } = await serviceDb
          .from(TABLES.SALES_ORDERS)
          .select("*")
          .eq("id", orderId)
          .single()

        if (salesOrder) {
          orderData = salesOrder
          orderSource = "acc_sales_orders"
        }
      }
    }

    if (!orderData || !orderSource) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      )
    }

    // 1. Update order status to completed in the source collection
    if (orderSource === "manual_orders") {
      await serviceDb.from(TABLES.MANUAL_ORDERS).update({
        status: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", orderId)
    } else if (orderSource === "orders") {
      await serviceDb.from(TABLES.ORDERS).update({
        status: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", orderId)
    }

    // 2. Update accounting sales order status (create if doesn't exist)
    const { data: salesOrderDoc } = await serviceDb
      .from(TABLES.SALES_ORDERS)
      .select("*")
      .eq("id", orderId)
      .single()

    if (salesOrderDoc) {
      await serviceDb.from(TABLES.SALES_ORDERS).update({
        status: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", orderId)
    } else {
      await serviceDb.from(TABLES.SALES_ORDERS).upsert({
        id: orderId,
        website_order_id: orderId,
        customer_id: (orderData as any).user_id || orderData.customer_id || "unknown",
        customer_name: (orderData as any).shipping_address?.fullName || orderData.customer_name || "Unknown Customer",
        items: orderData.items || [],
        status: "completed",
        total_amount: orderData.total || orderData.total_amount || 0,
        order_source: orderSource === "orders" ? "web" : "manual",
        created_at: orderData.created_at ? new Date(orderData.created_at).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "id" })
    }

    // 3. Complete work order (if not already completed)
    const { data: workOrders } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .eq("sales_order_id", orderId)

    if (workOrders && workOrders.length > 0) {
      const workOrderDoc = workOrders[0]

      const { WorkOrderMaterialService } = await import("@/lib/services/work-order-material-service")

      if (workOrderDoc.status !== "completed") {
        await WorkOrderMaterialService.completeWorkOrder(
          workOrderDoc.id,
          workOrderDoc.design_id
        )
      }
    }

    // 5. Generate invoice (if not already generated)
    const invoiceId = `INV-${orderId.slice(-8)}`

    const { data: existingInvoice } = await serviceDb
      .from(TABLES.INVOICES)
      .select("*")
      .eq("id", invoiceId)
      .single()

    if (!existingInvoice) {
      const customerId = (orderData as any).user_id || orderData.customer_id || "unknown"
      const customerName = (orderData as any).shipping_address?.fullName || orderData.customer_name || "Unknown Customer"
      const totalAmount = orderData.total || orderData.total_amount || 0

      const invoice: any = {
        sales_order_id: orderId,
        customer_id: customerId,
        customer_name: customerName,
        amount: totalAmount,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: "unpaid",
        created_at: new Date().toISOString(),
      }

      const { error: invoiceError } = await serviceDb.from(TABLES.INVOICES).insert(invoice)

      if (invoiceError) {
        console.error("Failed to upsert invoice:", invoiceError)
        return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 })
      }

      const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")
      
      await EnhancedAccountingService.createJournalEntry(
        JournalEntryType.SALES_INVOICE,
        [
          { 
            accountCode: "1110",
            accountName: "Accounts Receivable", 
            debit: totalAmount, 
            credit: 0, 
            description: `Invoice ${invoiceId}` 
          },
          { 
            accountCode: "4001",
            accountName: "Sales Revenue", 
            debit: 0, 
            credit: totalAmount, 
            description: `Sales revenue ${invoiceId}` 
          }
        ],
        invoiceId,
        `Invoice ${invoiceId}`
      )

      const { data: woSnapshot } = await serviceDb
        .from(TABLES.WORK_ORDERS)
        .select("*")
        .eq("sales_order_id", orderId)

      if (woSnapshot && woSnapshot.length > 0) {
        const woData = woSnapshot[0]
        const cogsAmount = woData.total_cost || woData.estimated_cost || 0

        if (cogsAmount > 0) {
          await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.SALES_COGS,
            [
              { 
                accountCode: "5001",
                accountName: "Cost of Goods Sold", 
                debit: cogsAmount, 
                credit: 0, 
                description: `COGS for order ${orderId}` 
              },
              { 
                accountCode: "1220",
                accountName: "Finished Goods Inventory", 
                debit: 0, 
                credit: cogsAmount, 
                description: `Inventory reduction for order ${orderId}` 
              }
            ],
            invoiceId,
            `COGS for order ${orderId}`
          )
          console.log(`✅ COGS journal entry created for order ${orderId}: EGP ${cogsAmount}`)
        } else {
          console.warn(`⚠️ No cost information found for work order associated with order ${orderId}`)
        }
      } else {
        console.warn(`⚠️ No work order found for order ${orderId}. Skipping COGS journal entry.`)
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      invoiceId,
      message: "Order completed and invoice generated successfully"
    })

  } catch (error) {
    console.error("Error completing order:", error)
    return NextResponse.json(
      { error: "Failed to complete order" },
      { status: 500 }
    )
  }
}
