import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    let query = db.collection(COLLECTIONS.INVOICES)
      .orderBy("created_at", "desc")
      .limit(limit)
    
    if (cursor) {
      const lastDoc = await db.collection(COLLECTIONS.INVOICES).doc(cursor).get()
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc)
      }
    }

    const invoicesSnapshot = await query.get()
    const invoices = invoicesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    const lastVisible = invoicesSnapshot.docs[invoicesSnapshot.docs.length - 1]
    const nextCursor = lastVisible ? lastVisible.id : null
    const hasMore = invoicesSnapshot.docs.length === limit

    return NextResponse.json({
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

    // 2. Record COGS (BUG-3)
    let cogsEntryId = null
    if (cost_of_goods_sold > 0) {
      const cogsLines = [
        {
          accountCode: "5001", // Cost of Goods Sold
          accountName: "Cost of Goods Sold",
          debit: cost_of_goods_sold,
          credit: 0,
          description: `COGS for invoice ${invoiceId}`
        },
        {
          accountCode: "1220", // Finished Goods Inventory
          accountName: "Finished Goods Inventory",
          debit: 0,
          credit: cost_of_goods_sold,
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
       console.warn(`⚠️ No COGS provided for invoice ${invoiceId}. Skipping COGS journal entry.`)
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

