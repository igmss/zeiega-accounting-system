import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
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
    const providedBuffer = Buffer.from(secret)
    const expectedBuffer = Buffer.from(expectedSecret)

    const isAuthorized = secret && 
      providedBuffer.length === expectedBuffer.length && 
      timingSafeEqual(providedBuffer, expectedBuffer)

    if (!isAuthorized) {
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

    const serviceDb = getServiceClient()

    const { data: returnData } = await serviceDb
      .from(TABLES.RETURNS)
      .select("*")
      .eq("id", returnId)
      .single()

    if (!returnData) {
      return NextResponse.json(
        { error: `Return ${returnId} not found` },
        { status: 404 }
      )
    }

    const now = new Date().toISOString()

    // 1. Update the return status (if not already updated)
    if (returnData.status !== status) {
      await serviceDb.from(TABLES.RETURNS).update({
        status: status,
        updated_at: now
      }).eq("id", returnId)
    }

    // 2. Trigger accounting actions based on status
    if (status === "completed") {
      console.log(`📝 Return ${returnId} completed. Creating credit memo and adjusting inventory...`)
      
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
      timestamp: now
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
