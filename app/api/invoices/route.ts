import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

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
      let query = db.collection(COLLECTIONS.INVOICES) as FirebaseFirestore.Query
      
      // Try ordered query first, fall back to unordered if mixed types exist
      try {
        query = db.collection(COLLECTIONS.INVOICES)
          .orderBy("created_at", "desc")
          .limit(limit)
        
        if (cursor) {
          const lastDoc = await db.collection(COLLECTIONS.INVOICES).doc(cursor).get()
          if (lastDoc.exists) {
            query = query.startAfter(lastDoc)
          }
        }
      } catch {
        query = db.collection(COLLECTIONS.INVOICES).limit(limit)
      }

      const invoicesSnapshot = await query.get()
      invoices = invoicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate?.() || doc.data().created_at || null,
        due_date: doc.data().due_date?.toDate?.() || doc.data().due_date || null,
        paid_at: doc.data().paid_at?.toDate?.() || doc.data().paid_at || null,
      }))

      const lastVisible = invoicesSnapshot.docs[invoicesSnapshot.docs.length - 1]
      nextCursor = lastVisible ? lastVisible.id : null
      hasMore = invoicesSnapshot.docs.length === limit
    } catch {
      // Final fallback — fetch without ordering if structured queries fail
      const snapshot = await db.collection(COLLECTIONS.INVOICES).limit(limit).get()
      invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
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

    // Generate invoice ID
    const invoiceId = `INV-${Date.now()}`

    // Create invoice document
    const invoice = {
      id: invoiceId,
      customer_id,
      customer_name,
      items: items || [],
      amount: amount || 0,
      tax_amount: tax_amount || 0,
      total_amount: total_amount || 0,
      cost_of_goods_sold: cost_of_goods_sold || 0,
      paid_amount: 0,
      due_date: due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(),
      status: "unpaid"
    }

    // 1. Record Revenue and AR (BUG-3)
    const revenueLines = [
      { 
        accountCode: "1110", // Accounts Receivable
        accountName: "Accounts Receivable",
        debit: total_amount || 0, 
        credit: 0, 
        description: `Invoice ${invoiceId} to ${customer_name || 'Customer'}` 
      },
      { 
        accountCode: "4001", // Sales Revenue
        accountName: "Sales Revenue",
        debit: 0, 
        credit: amount || 0, 
        description: `Net sales for ${invoiceId}` 
      }
    ]

    // Add VAT if applicable (BUG-4)
    if (tax_amount > 0) {
      revenueLines.push({
        accountCode: "2110", // VAT Payable
        accountName: "VAT Payable",
        debit: 0,
        credit: tax_amount,
        description: `VAT for invoice ${invoiceId}`
      })
    }

    const revenueResult = await EnhancedAccountingService.createJournalEntry(
      JournalEntryType.SALES_INVOICE,
      revenueLines,
      invoiceId,
      `Sales recording for invoice ${invoiceId}`
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
        const woSnapshot = await db.collection(COLLECTIONS.WORK_ORDERS)
          .where("sales_order_id", "==", body.sales_order_id)
          .where("status", "==", "completed")
          .limit(1)
          .get()
        
        if (!woSnapshot.empty) {
          const woData = woSnapshot.docs[0].data() as any
          finalCOGS = woData.final_completion_cost || woData.total_cost || woData.estimated_cost || 0
        }
      } catch (err) {
        console.warn(`⚠️ Failed to auto-calculate COGS for invoice ${invoiceId}:`, err)
      }
    }

    if (finalCOGS > 0) {
      const cogsLines = [
        {
          accountCode: "5301", // Cost of Goods Sold
          accountName: "Cost of Goods Sold",
          debit: finalCOGS,
          credit: 0,
          description: `COGS for invoice ${invoiceId}`
        },
        {
          accountCode: "1220", // Finished Goods Inventory
          accountName: "Finished Goods Inventory",
          debit: 0,
          credit: finalCOGS,
          description: `Inventory reduction for ${invoiceId}`
        }
      ]

      const cogsResult = await EnhancedAccountingService.createJournalEntry(
        JournalEntryType.SALES_COGS,
        cogsLines,
        invoiceId,
        `COGS recording for invoice ${invoiceId}`
      )
      
      if (cogsResult.success) {
        cogsEntryId = cogsResult.entryId
      } else {
        console.warn(`⚠️ COGS entry failed for invoice ${invoiceId}: ${cogsResult.error}`)
      }
    } else {
       console.warn(`⚠️ No COGS available for invoice ${invoiceId}. Skipping COGS journal entry.`)
    }

    // Save invoice to database
    await db.collection(COLLECTIONS.INVOICES).doc(invoiceId).set(invoice)

    return NextResponse.json({ 
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

