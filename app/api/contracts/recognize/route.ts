import { NextRequest, NextResponse } from "next/server"
import { RevenueRecognitionService } from "@/lib/services/revenue-recognition-service"
import { requirePermission } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("accounting:create")
    if (!auth.authorized) return auth.response

    const body = await req.json()
    const result = await RevenueRecognitionService.recognizeRevenue(
      body.contractId,
      body.costsIncurredThisPeriod || 0,
      body.userId,
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to recognize revenue" }, { status: 500 })
  }
}
