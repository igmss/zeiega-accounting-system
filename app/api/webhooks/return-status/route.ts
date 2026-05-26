import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { getCORSHeaders, handlePreflight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request, ["x-webhook-secret"]) ?? new NextResponse(null, { status: 204 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Accept webhook secret from header (x-webhook-secret) or body (webhookSecret)
    const headerSecret = request.headers.get("x-webhook-secret")
    const bodySecret = body.webhookSecret
    const secret = (headerSecret || bodySecret || '').trim()

    // Verify webhook secret for security (must happen before processing).
    const expectedSecret = (process.env.WEBHOOK_SECRET || '').trim()
    if (!secret || secret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCORSHeaders(request, ["x-webhook-secret"]) }
      )
    }

    const { returnId, status } = body

    if (!returnId || !status) {
      return NextResponse.json(
        { error: "Return ID and status are required" },
        { status: 400, headers: getCORSHeaders(request, ["x-webhook-secret"]) }
      )
    }

    console.log(`🔄 Webhook: Processing return ${returnId} -> ${status}`)

    // Get the return document from Firestore
    const returnRef = db.collection(COLLECTIONS.RETURNS).doc(returnId)
    const returnSnapshot = await returnRef.get()

    if (!returnSnapshot.exists) {
      return NextResponse.json(
        { error: `Return ${returnId} not found` },
        { status: 404 }
      )
    }

    const returnData = returnSnapshot.data()
    if (!returnData) {
      return NextResponse.json({ error: "No data found for return" }, { status: 404 })
    }

    const now = new Date()

    // 1. Update the return status in Firestore (if not already updated)
    if (returnData.status !== status) {
      await returnRef.update({
        status: status,
        updated_at: now
      })
    }

    // 2. Trigger accounting actions based on status
    if (status === "completed") {
      console.log(`📝 Return ${returnId} completed. Creating credit memo and adjusting inventory...`)
      
      // Use internal processReturn logic (which creates journal entry and adjusts inventory)
      // This is private, so we might need to expose a public wrapper or replicate logic
      // For now, let's call EnhancedAccountingService logic assuming we've added the FIX-003
      
      // Since processReturn is private, we will replicate the essential part or expose it.
      // Actually, EnhancedAccountingService.processReturn is private in the viewed version.
      // I'll make it public or create a public wrapper.
      
      const result = await EnhancedAccountingService.processReturn(returnData)

      if (!result?.success) {
        console.error(`❌ Accounting failed for return ${returnId}: ${result?.error || "Unknown error"}`)
        return NextResponse.json(
          { error: result?.error || `Failed to process return accounting for return ${returnId}` },
          { status: 500, headers: getCORSHeaders(request, ["x-webhook-secret"]) }
        )
      }

      console.log(`✅ Accounting triggered for return ${returnId} (credit memo: ${result.creditMemoId})`)
    }

    return NextResponse.json({
      success: true,
      message: `Return ${returnId} status updated to ${status}`,
      returnId,
      status,
      timestamp: now.toISOString()
    }, {
      headers: getCORSHeaders(request, ["x-webhook-secret"])
    })

  } catch (error) {
    console.error("Error processing return status webhook:", error)
    return NextResponse.json(
      { error: "Failed to process return status update" },
      { status: 500 }
    )
  }
}
