import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requireAuth, requirePermission } from "@/lib/auth"
import { generateOrderNumber } from "@/lib/utils/id-generator"

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
    const payments = (paymentsData || []).slice(0, limit).map((doc: Record<string, any>) => ({
      ...doc,
      id: doc.id,
      created_at: doc.created_at || null,
      date: doc.date || null,
    }))

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

const PAYMENT_ACCOUNT_MAP: Record<string, { account: string; name: string }> = {
  cash:            { account: "1101", name: "Cash on Hand" },
  bank_transfer:   { account: "1103", name: "Bank Account" },
  bank:            { account: "1103", name: "Bank Account" },
  transfer:        { account: "1103", name: "Bank Account" },
  card:            { account: "1103", name: "Bank Account" },
  credit_card:     { account: "1103", name: "Bank Account" },
  check:           { account: "1103", name: "Bank Account" },
  mobile_payment:  { account: "1103", name: "Bank Account" },
  paypal:          { account: "1103", name: "Bank Account" },
  other:           { account: "1103", name: "Bank Account" },
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("payments:create")
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const {
      amount,
      invoice_id,
      payment_method,
      date,
      reference_number
    } = body

    if (!amount || amount <= 0 || !invoice_id) {
      return NextResponse.json({ error: "Amount and invoice_id are required" }, { status: 400 })
    }

    const paymentDate = date ? new Date(date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]

    const { EnhancedAccountingService, JournalEntryType } = await import("@/lib/services/enhanced-accounting-service")

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
    const invoiceTotal = invoiceData.total_amount || invoiceData.amount || 0
    const paidSoFar = invoiceData.paid_amount || 0
    const remainingBalance = invoiceTotal - paidSoFar

    if (remainingBalance <= 0) {
      return NextResponse.json({ error: "Invoice is already fully paid" }, { status: 400 })
    }

    if (amount > remainingBalance + 0.01) {
      return NextResponse.json({
        error: `Overpayment not allowed. Remaining balance is EGP ${remainingBalance.toFixed(2)}`
      }, { status: 400 })
    }

    // Map method to DB-valid value and resolve payment account
    const methodMap: Record<string, string> = {
      cash: "cash", bank: "bank_transfer", transfer: "bank_transfer",
      bank_transfer: "bank_transfer", check: "check",
      card: "card", credit_card: "card",
      mobile_payment: "mobile_payment", mobile: "mobile_payment",
      paypal: "bank_transfer", other: "bank_transfer",
    }
    const dbMethod = methodMap[payment_method?.toLowerCase()] || "cash"
    const acctInfo = PAYMENT_ACCOUNT_MAP[payment_method?.toLowerCase()] || PAYMENT_ACCOUNT_MAP["cash"]

    const paymentNumber = `PAY-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    // Create journal entry with user-specified date
    const lines = [
      {
        accountCode: acctInfo.account,
        accountName: acctInfo.name,
        debit: amount,
        credit: 0,
        description: `Payment ${paymentNumber} via ${dbMethod} — invoice ${invoiceData.invoice_number || invoice_id}`
      },
      {
        accountCode: "1110",
        accountName: "Accounts Receivable",
        debit: 0,
        credit: amount,
        description: `AR reduction for invoice ${invoiceData.invoice_number || invoice_id}`
      }
    ]

    const jeResult = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.PAYMENT_RECEIVED,
      lines,
      paymentNumber,
      `Payment receipt for invoice ${invoiceData.invoice_number || invoice_id}. Ref: ${reference_number || 'N/A'}`,
      null,
      new Date(paymentDate)
    )

    if (!jeResult.success) {
      return NextResponse.json({ error: jeResult.error || "Failed to create journal entry" }, { status: 400 })
    }

    // Update invoice paid_amount and status
    const newPaidAmount = paidSoFar + amount
    const isFullyPaid = newPaidAmount >= invoiceTotal - 0.01

    const { error: invUpdateError } = await getServiceClient()
      .from(TABLES.INVOICES)
      .update({
        paid_amount: newPaidAmount,
        status: isFullyPaid ? "paid" : "partial",
        last_payment_at: new Date().toISOString()
      })
      .eq("id", invoice_id)

    if (invUpdateError) {
      console.error("Failed to update invoice after JE creation:", invUpdateError)
      return NextResponse.json({
        error: `Invoice update failed: ${invUpdateError.message}. Journal entry ${jeResult.entryId} was created.`,
        journalEntryId: jeResult.entryId
      }, { status: 500 })
    }

    // Insert payment record
    const { data: inserted, error: paymentError } = await getServiceClient()
      .from(TABLES.PAYMENTS)
      .insert({
        invoice_id,
        payment_number: paymentNumber,
        amount,
        method: dbMethod,
        reference_number: reference_number || null,
        date: paymentDate,
        notes: `JE: ${jeResult.entryId}`,
      })
      .select()
      .single()

    if (paymentError) {
      console.error("Failed to insert payment record after JE creation:", paymentError)
      return NextResponse.json({
        error: "Payment record insert failed. Journal entry and invoice update were committed.",
        journalEntryId: jeResult.entryId
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      paymentId: inserted?.id,
      paymentNumber,
      amount,
      method: dbMethod,
      invoiceStatus: isFullyPaid ? "paid" : "partial",
      remainingBalance: Math.max(0, invoiceTotal - newPaidAmount),
      journalEntryId: jeResult.entryId,
    })
  } catch (error) {
    console.error("Error creating payment:", error)
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 })
  }
}
