import { type NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { requireAdmin } from "@/lib/auth/auth-helpers"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response
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

    // Update inventory valuations
    const result = await EnhancedAccountingService.updateInventoryValuations()

    return NextResponse.json({
      success: true,
      updated: result.updated,
      lowStockAlerts: result.lowStockAlerts,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Cron job error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
