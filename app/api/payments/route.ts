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
    const payments = paymentsSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        date: data.date?.toDate?.() || data.date || null,
        created_at: data.created_at?.toDate?.() || data.created_at || null,
      }
    })

    const lastVisible = paymentsSnapshot.docs[paymentsSnapshot.docs.length - 1]
    const nextCursor = lastVisible ? lastVisible.id : null
    const hasMore = paymentsSnapshot.docs.length === limit

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

    // CHANGED: Wrap JE creation + invoice update + payment record in a Firestore transaction
    const paymentId = `PAY-${Date.now()}`

    const result = await db.runTransaction(async (tx) => {
      // ── Phase 1: Read invoice ──────────────────────────────────────────
      const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc(invoice_id)
      const invoiceDoc = await tx.get(invoiceRef)
      
      if (!invoiceDoc.exists) {
        throw new Error("Invoice not found")
      }

      const invoiceData = invoiceDoc.data() as any
      const remainingBalance = (invoiceData.total_amount || 0) - (invoiceData.paid_amount || 0)

      if (remainingBalance <= 0) {
        throw new Error("Invoice is already fully paid")
      }

      if (amount > remainingBalance + 0.01) {
        throw new Error(`Overpayment not allowed. Remaining balance is ${remainingBalance.toLocaleString()}`)
      }

      // ── Phase 1 (continued): Prepare payment account mapping ───────────
      let paymentAccount = "1101"
      let accountName = "Cash on Hand"

      if (payment_method === "bank" || payment_method === "transfer" || payment_method === "card") {
        paymentAccount = "1103"
        accountName = "Bank Account"
      }

      // ── Phase 2: Create journal entry within transaction ────────────────
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
        "system",
        undefined,
        tx
      )

      if (!jeResult.success) {
        throw new Error(jeResult.error || "Failed to create journal entry")
      }

      // ── Phase 2: Update invoice and save payment record ────────────────
      const newPaidAmount = (invoiceData.paid_amount || 0) + amount
      const isFullyPaid = newPaidAmount >= (invoiceData.total_amount || 0) - 0.01

      tx.update(invoiceRef, {
        paid_amount: newPaidAmount,
        status: isFullyPaid ? "paid" : "partial",
        last_payment_at: new Date()
      })

      const payment = {
        id: paymentId,
        invoice_id,
        customer_name: invoiceData.customer_name || "",
        amount,
        payment_method,
        method: payment_method, // Frontend alias
        reference_number: reference_number || "",
        reference: reference_number || "", // Frontend alias
        date: date || new Date().toISOString(),
        journal_entry_id: jeResult.entryId,
        created_at: new Date()
      }
      tx.set(db.collection(COLLECTIONS.PAYMENTS).doc(paymentId), payment)

      return { success: true, paymentId, ...payment }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error creating payment:", error)
    const rawMessage = error instanceof Error ? error.message : ""
    if (rawMessage === "Invoice not found") {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }
    if (rawMessage.includes("fully paid") || rawMessage.includes("Overpayment")) {
      return NextResponse.json({ error: rawMessage }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 })
  }
}

// PUT endpoint removed to ensure journal entry immutability (BUG-011)
