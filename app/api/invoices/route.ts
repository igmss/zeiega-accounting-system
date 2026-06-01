import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"
import { generateInvoiceNumber } from "@/lib/utils/id-generator"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    let invoices: any[] = []
    let nextCursor: string | null = null
    let hasMore = false

    try {
      let query = getServiceClient()
        .from(TABLES.INVOICES)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit + 1)

      if (cursor) {
        const { data: cursorDoc } = await getServiceClient()
          .from(TABLES.INVOICES)
          .select("created_at")
          .eq("id", cursor)
          .single()

        if (cursorDoc?.created_at) {
          query = query.lt("created_at", cursorDoc.created_at)
        }
      }

      const { data, error } = await query

      if (!error && data) {
        hasMore = data.length > limit
        invoices = data.slice(0, limit).map((doc: Record<string, any>) => ({
          id: doc.id,
          ...doc,
          created_at: doc.created_at || null,
          due_date: doc.due_date || null,
          paid_at: doc.paid_at || null,
        }))

        const lastVisible = invoices[invoices.length - 1]
        nextCursor = lastVisible ? lastVisible.id : null
      }
    } catch {
      const { data, error } = await getServiceClient()
        .from(TABLES.INVOICES)
        .select("*")
        .limit(limit)

      if (!error && data) {
        invoices = data.map((doc: Record<string, any>) => ({ id: doc.id, ...doc }))
      }
    }

    return NextResponse.json({
      success: true,
      data: invoices,
      nextCursor,
      hasMore
    })
  } catch (error) {
    console.error("Error fetching invoices:", error)
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("invoices:create")
  if (!auth.authorized) return auth.response
  try {
    const body = await request.json()
    const {
      amount,       // Net amount
      tax_amount,   // VAT (14%)
      total_amount, // Gross amount
      cost_of_goods_sold,
      customer_id,
      customer_name,
      items,
      due_date
    } = body

    const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")

    const invoiceNumber = generateInvoiceNumber()

    const invoice = {
      customer_id,
      customer_name,
      invoice_number: invoiceNumber,
      amount: amount || 0,
      sales_order_id: body.sales_order_id || null,
      due_date: due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      notes: body.notes || null,
      status: "pending"
    }

    // 1. Record Revenue and AR (BUG-3)
    const revenueLines = [
      {
        accountCode: "1110", // Accounts Receivable
        accountName: "Accounts Receivable",
        debit: (total_amount || (amount || 0) + (tax_amount || 0) || 0),
        credit: 0,
        description: `Invoice ${invoiceNumber} to ${customer_name || 'Customer'}`
      },
      {
        accountCode: "4001", // Sales Revenue
        accountName: "Sales Revenue",
        debit: 0,
        credit: amount || 0,
        description: `Net sales for ${invoiceNumber}`
      }
    ]

    // Add VAT if applicable (BUG-4)
    if (tax_amount > 0) {
      revenueLines.push({
        accountCode: "2110", // VAT Payable
        accountName: "VAT Payable",
        debit: 0,
        credit: tax_amount,
        description: `VAT for invoice ${invoiceNumber}`
      })
    }

    const revenueResult = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.SALES_INVOICE,
      revenueLines,
      invoiceNumber,
      `Sales recording for invoice ${invoiceNumber}`
    )

    if (!revenueResult.success) {
      return NextResponse.json({ error: revenueResult.error }, { status: 400 })
    }

    // 2. Record COGS (BUG-3) — auto-calculate from work order if not provided
    let cogsEntryId = null
    let finalCOGS = cost_of_goods_sold || 0

    if (finalCOGS <= 0 && body.sales_order_id) {
      try {
        // Look up completed work orders for this sales order
        const { data: woData, error: woError } = await getServiceClient()
          .from(TABLES.WORK_ORDERS)
          .select("*")
          .eq("sales_order_id", body.sales_order_id)
          .eq("status", "completed")
          .limit(1)

        if (!woError && woData && woData.length > 0) {
          const wo: any = woData[0]
          finalCOGS = wo.total_cost || wo.estimated_cost || 0
        }
      } catch (err) {
        console.warn(`⚠️ Failed to auto-calculate COGS for invoice ${invoiceNumber}:`, err)
      }
    }

    if (finalCOGS > 0) {
      const cogsLines = [
        {
          accountCode: "5301", // Cost of Goods Sold
          accountName: "Cost of Goods Sold",
          debit: finalCOGS,
          credit: 0,
          description: `COGS for invoice ${invoiceNumber}`
        },
        {
          accountCode: "1220", // Finished Goods Inventory
          accountName: "Finished Goods Inventory",
          debit: 0,
          credit: finalCOGS,
          description: `Inventory reduction for ${invoiceNumber}`
        }
      ]

      const cogsResult = await EnhancedAccountingService.createJournalEntry(
        JournalEntryType.SALES_COGS,
        cogsLines,
        invoiceNumber,
        `COGS recording for invoice ${invoiceNumber}`
      )

      if (cogsResult.success) {
        cogsEntryId = cogsResult.entryId
      } else {
        console.warn(`⚠️ COGS entry failed for invoice ${invoiceNumber}: ${cogsResult.error}`)
      }
    } else {
       console.warn(`⚠️ No COGS available for invoice ${invoiceNumber}. Skipping COGS journal entry.`)
    }

    // Save invoice to database
    const { data: inserted, error: insertError } = await getServiceClient()
      .from(TABLES.INVOICES)
      .insert(invoice)
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({
      id: inserted?.id || invoiceNumber,
      ...invoice,
      revenueJournalEntryId: revenueResult.entryId,
      cogsJournalEntryId: cogsEntryId
    })
  } catch (error) {
    console.error("Error creating invoice:", error)
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    )
  }
}

// PUT endpoint removed to ensure journal entry immutability (BUG-011)
