import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    let query = db.collection(COLLECTIONS.PAYMENTS)
      .orderBy("created_at", "desc")
      .limit(limit)
    
    if (cursor) {
      const lastDoc = await db.collection(COLLECTIONS.PAYMENTS).doc(cursor).get()
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc)
      }
    }

    const paymentsSnapshot = await query.get()
    const payments = paymentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    const lastVisible = paymentsSnapshot.docs[paymentsSnapshot.docs.length - 1]
    const nextCursor = lastVisible ? lastVisible.id : null
    const hasMore = paymentsSnapshot.docs.length === limit

    return NextResponse.json({
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

    // 1. Fetch and validate invoice (BUG-5)
    const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc(invoice_id)
    const invoiceDoc = await invoiceRef.get()
    
    if (!invoiceDoc.exists) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const invoiceData = invoiceDoc.data() as any
    const remainingBalance = (invoiceData.total_amount || 0) - (invoiceData.paid_amount || 0)

    if (remainingBalance <= 0) {
      return NextResponse.json({ error: "Invoice is already fully paid" }, { status: 400 })
    }

    if (amount > remainingBalance + 0.01) { // Small buffer for rounding
      return NextResponse.json({ 
        error: `Overpayment not allowed. Remaining balance is ${remainingBalance.toLocaleString()}` 
      }, { status: 400 })
    }

    // 2. Map payment method to account (BUG-5)
    let paymentAccount = "1101" // Cash on Hand default
    let accountName = "Cash on Hand"

    if (payment_method === "bank" || payment_method === "transfer" || payment_method === "card") {
      paymentAccount = "1103" // Bank - Main
      accountName = "Bank Account"
    }

    // Generate payment ID
    const paymentId = `PAY-${Date.now()}`

    // 3. Create journal entry via service
    const lines = [
      {
        accountCode: paymentAccount,
        accountName: accountName,
        debit: amount,
        credit: 0,
        description: `Payment ${paymentId} received for invoice ${invoice_id}`
      },
      {
        accountCode: "1110", // Accounts Receivable
        accountName: "Accounts Receivable",
        debit: 0,
        credit: amount,
        description: `AR reduction for invoice ${invoice_id}`
      }
    ]

    const result = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.PAYMENT_RECEIVED,
      lines,
      paymentId,
      `Payment receipt for invoice ${invoice_id}. Ref: ${reference_number || 'N/A'}`
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // 4. Update Invoice (increment paid_amount, update status)
    const newPaidAmount = (invoiceData.paid_amount || 0) + amount
    const isFullyPaid = newPaidAmount >= (invoiceData.total_amount || 0) - 0.01

    await invoiceRef.update({
      paid_amount: newPaidAmount,
      status: isFullyPaid ? "paid" : "partial",
      last_payment_at: new Date()
    })

    // Save payment record
    const payment = {
      id: paymentId,
      invoice_id,
      amount,
      payment_method,
      reference_number: reference_number || "",
      date: date || new Date().toISOString(),
      journal_entry_id: result.entryId,
      created_at: new Date()
    }
    await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).set(payment)

    return NextResponse.json({ success: true, paymentId, ...payment })
  } catch (error) {
    console.error("Error creating payment:", error)
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    )
  }
}

// PUT endpoint removed to ensure journal entry immutability (BUG-011)
