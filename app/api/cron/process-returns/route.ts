import { type NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const expected = process.env.CRON_SECRET
    if (!authHeader || !expected || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const provided = authHeader.slice(7)
    const bufA = Buffer.from(provided)
    const bufB = Buffer.from(expected)
    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Process returns from website
    const result = await EnhancedAccountingService.syncWebsiteReturns()

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Cron job error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
