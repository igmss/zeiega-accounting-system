import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission } from "@/lib/auth/auth-helpers"

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requirePermission("work-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      )
    }

    // Try to get the order from multiple possible collections
    let orderData = null
    let orderSource = null

    // Try manual_orders first
    const manualOrderDoc = await db.collection(COLLECTIONS.MANUAL_ORDERS).doc(orderId).get()
    if (manualOrderDoc.exists) {
      orderData = manualOrderDoc.data()
      orderSource = "manual_orders"
    } else {
      // Try orders collection (web orders)
      const webOrderDoc = await db.collection(COLLECTIONS.ORDERS).doc(orderId).get()
      if (webOrderDoc.exists) {
        orderData = webOrderDoc.data()
        orderSource = "orders"
      } else {
        // Try acc_sales_orders (accounting system)
        const salesOrderDoc = await db.collection(COLLECTIONS.SALES_ORDERS).doc(orderId).get()
        if (salesOrderDoc.exists) {
          orderData = salesOrderDoc.data()
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
      await db.collection(COLLECTIONS.MANUAL_ORDERS).doc(orderId).update({
        status: "completed",
        updatedAt: new Date()
      })
    } else if (orderSource === "orders") {
      await db.collection(COLLECTIONS.ORDERS).doc(orderId).update({
        status: "completed",
        updatedAt: new Date()
      })
    }

    // 2. Update accounting sales order status (create if doesn't exist)
    const salesOrderRef = db.collection(COLLECTIONS.SALES_ORDERS).doc(orderId)
    const salesOrderDoc = await salesOrderRef.get()

    if (salesOrderDoc.exists) {
      await salesOrderRef.update({
        status: "completed",
        updated_at: new Date()
      })
    } else {
      // Create sales order if it doesn't exist in accounting system
      await salesOrderRef.set({
        id: orderId,
        website_order_id: orderId,
        customer_id: orderData.userId || orderData.customer_id || "unknown",
        customer_name: orderData.shippingAddress?.fullName || orderData.customer_name || "Unknown Customer",
        items: orderData.items || [],
        status: "completed",
        total_amount: orderData.total || orderData.total_amount || 0,
        order_source: orderSource === "orders" ? "web" : "manual",
        created_at: orderData.createdAt?.toDate?.() || new Date(),
        updated_at: new Date()
      })
    }

    // 3. Complete work order (if not already completed)
    const workOrdersSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS)
      .where("sales_order_id", "==", orderId)
      .get()

    if (!workOrdersSnapshot.empty) {
      const workOrderDoc = workOrdersSnapshot.docs[0]
      const workOrderData = workOrderDoc.data()

      const { WorkOrderMaterialService } = await import("@/lib/services/work-order-material-service")
      const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")

      // Only update if not already completed
      if (workOrderData.status !== "completed") {
        await WorkOrderMaterialService.completeWorkOrder(
          workOrderDoc.id,
          workOrderData.design_id
        )
      }
    }

    // 5. Generate invoice (if not already generated)
    const invoiceId = `INV-${orderId.slice(-8)}`

    // Check if invoice already exists
    const existingInvoice = await db.collection(COLLECTIONS.INVOICES).doc(invoiceId).get()

    if (!existingInvoice.exists) {
      // Extract customer info based on order source
      const customerId = orderData.userId || orderData.customer_id || "unknown"
      const customerName = orderData.shippingAddress?.fullName || orderData.customer_name || "Unknown Customer"
      const totalAmount = orderData.total || orderData.total_amount || 0

      const invoice = {
        id: invoiceId,
        sales_order_id: orderId,
        customer_id: customerId,
        customer_name: customerName,
        amount: totalAmount,
        total: totalAmount, // Also include 'total' field for consistency
        tax_amount: 0, // You can add tax calculation here
        total_amount: totalAmount,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: "unpaid",
        created_at: new Date(),
        items: orderData.items || []
      }

      await db.collection(COLLECTIONS.INVOICES).doc(invoiceId).set(invoice)

      // 6. Create journal entry for invoice (Revenue)
      const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")
      
      await EnhancedAccountingService.createJournalEntry(
        JournalEntryType.SALES_INVOICE,
        [
          { 
            accountCode: "1110", // AR
            accountName: "Accounts Receivable", 
            debit: totalAmount, 
            credit: 0, 
            description: `Invoice ${invoiceId}` 
          },
          { 
            accountCode: "4001", // Sales Revenue
            accountName: "Sales Revenue", 
            debit: 0, 
            credit: totalAmount, 
            description: `Sales revenue ${invoiceId}` 
          }
        ],
        invoiceId,
        `Invoice ${invoiceId}`
      )

      // 7. Create COGS journal entry (Cost)
      // Fetch the associated work order to get the cost
      const woSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS)
        .where("sales_order_id", "==", orderId)
        .get()

      if (!woSnapshot.empty) {
        const woData = woSnapshot.docs[0].data()
        const cogsAmount = woData.total_cost || woData.estimated_cost || 0

        if (cogsAmount > 0) {
          await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.SALES_COGS,
            [
              { 
                accountCode: "5001", // COGS / Raw Materials Used
                accountName: "Cost of Goods Sold", 
                debit: cogsAmount, 
                credit: 0, 
                description: `COGS for order ${orderId}` 
              },
              { 
                accountCode: "1220", // Finished Goods Inventory
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
