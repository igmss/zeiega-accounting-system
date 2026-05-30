import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requireAuth, requirePermission } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    let query = getServiceClient()
      .from(TABLES.PAYMENTS)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit + 1)

    if (cursor) {
      const { data: cursorDoc, error: cursorError } = await getServiceClient()
        .from(TABLES.PAYMENTS)
        .select("created_at")
        .eq("id", cursor)
        .single()

      if (!cursorError && cursorDoc?.created_at) {
        query = query.lt("created_at", cursorDoc.created_at)
      }
    }

    const { data: paymentsData, error } = await query

    if (error) throw error

    const hasMore = (paymentsData || []).length > limit
    const payments = (paymentsData || []).slice(0, limit).map((doc: Record<string, any>) => {
      return {
        id: doc.id,
        ...doc,
        date: doc.date || null,
        created_at: doc.created_at || null,
      }
    })

    const lastVisible = payments[payments.length - 1]
    const nextCursor = lastVisible ? lastVisible.id : null

    return NextResponse.json({
      success: true,
      data: payments,
      nextCursor,
      hasMore
    })
  } catch (error) {
    console.error("Error fetching payments:", error)
    return NextResponse.json(
      { error: "Failed to fetch payments" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("payments:create")
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const {
      amount,
      invoice_id,
      payment_method, // "cash", "bank", "card"
      date,
      reference_number
    } = body

    if (!amount || amount <= 0 || !invoice_id) {
      return NextResponse.json({ error: "Amount and invoice_id are required" }, { status: 400 })
    }

    const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")

    const paymentId = `PAY-${Date.now()}`

    // Read invoice
    const { data: invoiceDoc, error: invoiceError } = await getServiceClient()
      .from(TABLES.INVOICES)
      .select("*")
      .eq("id", invoice_id)
      .single()

    if (invoiceError || !invoiceDoc) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const invoiceData = invoiceDoc as any
    const remainingBalance = (invoiceData.total_amount || 0) - (invoiceData.paid_amount || 0)

    if (remainingBalance <= 0) {
      return NextResponse.json({ error: "Invoice is already fully paid" }, { status: 400 })
    }

    if (amount > remainingBalance + 0.01) {
      return NextResponse.json({
        error: `Overpayment not allowed. Remaining balance is ${remainingBalance.toLocaleString()}`
      }, { status: 400 })
    }

    // Prepare payment account mapping
    let paymentAccount = "1101"
    let accountName = "Cash on Hand"

    if (payment_method === "bank" || payment_method === "transfer" || payment_method === "card") {
      paymentAccount = "1103"
      accountName = "Bank Account"
    }

    // Create journal entry
    const lines = [
      {
        accountCode: paymentAccount,
        accountName: accountName,
        debit: amount,
        credit: 0,
        description: `Payment ${paymentId} received for invoice ${invoice_id}`
      },
      {
        accountCode: "1110",
        accountName: "Accounts Receivable",
        debit: 0,
        credit: amount,
        description: `AR reduction for invoice ${invoice_id}`
      }
    ]

    const jeResult = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.PAYMENT_RECEIVED,
      lines,
      paymentId,
      `Payment receipt for invoice ${invoice_id}. Ref: ${reference_number || 'N/A'}`,
      "system"
    )

    if (!jeResult.success) {
      return NextResponse.json({ error: jeResult.error || "Failed to create journal entry" }, { status: 400 })
    }

    // Update invoice and create payment record
    const newPaidAmount = (invoiceData.paid_amount || 0) + amount
    const isFullyPaid = newPaidAmount >= (invoiceData.total_amount || 0) - 0.01

    await getServiceClient()
      .from(TABLES.INVOICES)
      .update({
        paid_amount: newPaidAmount,
        status: isFullyPaid ? "paid" : "partial",
        last_payment_at: new Date().toISOString()
      })
      .eq("id", invoice_id)

    const payment = {
      id: paymentId,
      invoice_id,
      customer_name: invoiceData.customer_name || "",
      amount,
      payment_method,
      method: payment_method,
      reference_number: reference_number || "",
      reference: reference_number || "",
      date: date || new Date().toISOString(),
      journal_entry_id: jeResult.entryId,
      created_at: new Date().toISOString()
    }

    const { error: paymentError } = await getServiceClient()
      .from(TABLES.PAYMENTS)
      .insert(payment)
      .select()

    if (paymentError) {
      console.error("Failed to insert payment after journal entry creation:", paymentError)
      return NextResponse.json({ error: "Failed to create payment record. Journal entry was created and may need manual cleanup.", journalEntryId: jeResult.entryId }, { status: 500 })
    }

    return NextResponse.json({ success: true, paymentId, ...payment })
  } catch (error) {
    console.error("Error creating payment:", error)
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 })
  }
}

// PUT endpoint removed to ensure journal entry immutability (BUG-011)
