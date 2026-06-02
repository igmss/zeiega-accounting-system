import { NextResponse } from "next/server"
import { TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"
import { generateInvoiceNumber } from "@/lib/utils/id-generator"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    const { workOrderId } = await request.json()

    if (!workOrderId) {
      return NextResponse.json(
        { error: "Work order ID is required" },
        { status: 400 }
      )
    }

    const serviceDb = getServiceClient()

    const { data: workOrder } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .eq("id", workOrderId)
      .single()

    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      )
    }

    if (workOrder.status === "completed") {
      return NextResponse.json(
        { error: "Work order is already completed" },
        { status: 409 }
      )
    }

    const { WorkOrderMaterialService } = await import("@/lib/services/work-order-material-service")

    const result = await WorkOrderMaterialService.completeWorkOrder(
      workOrderId,
      workOrder.design_id || ""
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    let invoiceId: string | null = null
    const journalEntryIds: string[] = []
    if (result.journalEntryId) journalEntryIds.push(result.journalEntryId)

    // Update Sales Order + create invoice + AR/COGS journal entries
    if (workOrder.sales_order_id) {
      const soId = workOrder.sales_order_id

      // Look up the sales order (maybeSingle to avoid exception when FK doesn't match)
      const { data: soDoc } = await serviceDb
        .from(TABLES.SALES_ORDERS)
        .select("*")
        .eq("id", soId)
        .maybeSingle()

      const { data: manualDoc } = await serviceDb
        .from(TABLES.MANUAL_ORDERS)
        .select("*")
        .eq("id", soId)
        .maybeSingle()

      if (soDoc) {
        await serviceDb.from(TABLES.SALES_ORDERS).update({
          status: "completed",
          updated_at: new Date().toISOString()
        }).eq("id", soId)
      }
      if (manualDoc) {
        await serviceDb.from(TABLES.MANUAL_ORDERS).update({
          status: "completed",
          updated_at: new Date().toISOString()
        }).eq("id", soId)
      }

      // Check if invoice already exists for this sales_order_id
      const { data: existingInvoice } = await serviceDb
        .from(TABLES.INVOICES)
        .select("id")
        .eq("sales_order_id", soId)
        .maybeSingle()

      if (!existingInvoice) {
        const customerName = (soDoc as any)?.shipping_address?.fullName
          || (manualDoc as any)?.customer_name
          || workOrder.customer_name
          || "Unknown Customer"

        const rawCustomerId = (soDoc as any)?.user_id
          || (manualDoc as any)?.user_id
          || workOrder.customer_id
          || ""

        const totalAmount = (soDoc as any)?.total
          || (manualDoc as any)?.total_amount
          || workOrder.total_amount
          || 0

        // Egyptian VAT 14% — split gross into net + tax (VAT-inclusive pricing)
        const VAT_RATE = 0.14
        const netAmount = totalAmount / (1 + VAT_RATE)
        const taxAmount = totalAmount - netAmount

        // Resolve customer UUID: migrate 00007 added FK constraint on customer_id → customers.id
        // Only insert a valid customer UUID, otherwise pass null to satisfy FK
        let resolvedCustomerId: string | null = null
        if (rawCustomerId) {
          const { data: cust } = await serviceDb
            .from(TABLES.CUSTOMERS)
            .select("id")
            .or(`id.eq.${rawCustomerId},user_id.eq.${rawCustomerId}`)
            .maybeSingle()
          if (cust?.id) resolvedCustomerId = cust.id
        }

        // Also update sales_orders with tax breakdown
        await serviceDb.from(TABLES.SALES_ORDERS).update({
          subtotal: netAmount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          updated_at: new Date().toISOString()
        }).eq("id", soId)

        const invoiceNumber = generateInvoiceNumber()

        const { data: newInvoice, error: invoiceError } = await serviceDb
          .from(TABLES.INVOICES)
          .insert({
            sales_order_id: soId,
            invoice_number: invoiceNumber,
            customer_id: resolvedCustomerId,
            customer_name: customerName,
            amount: netAmount,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            status: "pending",
          })
          .select("id, invoice_number")
          .single()

        if (invoiceError) {
          console.error("Failed to create invoice:", invoiceError)
          return NextResponse.json({ error: "Failed to create invoice", detail: invoiceError.message }, { status: 500 })
        }

        invoiceId = newInvoice?.id || null

        // Sales Invoice JE — AR + Revenue + VAT (Egyptian 14%)
        const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")
        const invoiceRef = invoiceId || `INV-${String(soId).slice(-8)}`

        if (totalAmount > 0) {
          const jeLines: any[] = [
            { accountCode: "1110", accountName: "Accounts Receivable", debit: totalAmount, credit: 0, description: `Invoice ${invoiceRef}` },
            { accountCode: "4001", accountName: "Sales Revenue", debit: 0, credit: netAmount, description: `Net sales ${invoiceRef} (14% VAT)` }
          ]
          if (taxAmount > 0.01) {
            jeLines.push({ accountCode: "2110", accountName: "VAT Payable - Output", debit: 0, credit: taxAmount, description: `Output VAT 14% on ${invoiceRef}` })
          }
          const arResult = await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.SALES_INVOICE,
            jeLines,
            invoiceRef,
            `Invoice ${invoiceRef}`
          )
          if (arResult.success && arResult.entryId) journalEntryIds.push(arResult.entryId)
        }

        // COGS JE — FG consumed
        const woTotalCost = workOrder.total_cost || workOrder.estimated_cost || 0
        if (woTotalCost > 0) {
          const cogsResult = await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.SALES_COGS,
            [
              { accountCode: "5301", accountName: "Cost of Goods Sold", debit: woTotalCost, credit: 0, description: `COGS for order ${soId}` },
              { accountCode: "1220", accountName: "Finished Goods Inventory", debit: 0, credit: woTotalCost, description: `Finished goods consumed for order ${soId}` }
            ],
            invoiceRef,
            `COGS for order ${soId}`
          )
          if (cogsResult.success && cogsResult.entryId) journalEntryIds.push(cogsResult.entryId)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Work order completed successfully",
      workOrderId,
      invoiceId,
      journalEntryIds,
      totalValue: workOrder.total_amount || 0
    })

  } catch (error) {
    console.error("Error completing work order:", error)
    return NextResponse.json(
      { error: "Failed to complete work order" },
      { status: 500 }
    )
  }
}
