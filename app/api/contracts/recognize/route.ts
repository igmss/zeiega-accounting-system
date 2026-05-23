import { NextRequest, NextResponse } from "next/server"
import { RevenueRecognitionService } from "@/lib/services/revenue-recognition-service"

export async function POST(req: NextRequest) {
  try {
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
