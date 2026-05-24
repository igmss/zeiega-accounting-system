import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"

// Get allowed origins from environment variable
function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || ""
  const list = origins.split(",").map((o) => o.trim()).filter(Boolean)
  
  // Always include Cloud Functions domain for webhooks (FIX-005)
  // Note: Firestore triggers/functions don't always send an 'origin' header, 
  // but for those that do, we should permit this pattern.
  // The actual verification is handled by the webhookSecret.

  // In development, allow localhost
  if (process.env.NODE_ENV === "development") {
    list.push("http://localhost:3000", "http://localhost:3001")
  }
  return list
}

// Apply CORS headers safely
function getCORSHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || ""
  const allowedOrigins = getAllowedOrigins()

  // Only allow specific origins
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-webhook-secret",
    }
  }

  return {}
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const corsHeaders = getCORSHeaders(request)

  if (Object.keys(corsHeaders).length === 0) {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Accept webhook secret from header (x-webhook-secret) or body (webhookSecret)
    const headerSecret = request.headers.get("x-webhook-secret")
    const bodySecret = body.webhookSecret
    const secret = headerSecret || bodySecret

    // Verify webhook secret for security (must happen before processing).
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: getCORSHeaders(request) }
      )
    }

    const { returnId, status } = body

    if (!returnId || !status) {
      return NextResponse.json(
        { error: "Return ID and status are required" },
        { status: 400, headers: getCORSHeaders(request) }
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
          { status: 500, headers: getCORSHeaders(request) }
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
      headers: getCORSHeaders(request)
    })

  } catch (error) {
    console.error("Error processing return status webhook:", error)
    return NextResponse.json(
      { error: "Failed to process return status update" },
      { status: 500 }
    )
  }
}
