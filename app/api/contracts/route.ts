import { NextRequest, NextResponse } from "next/server"
import { RevenueRecognitionService } from "@/lib/services/revenue-recognition-service"

export async function GET() {
  try {
    const contracts = await RevenueRecognitionService.getActiveContracts()
    return NextResponse.json({ contracts })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await RevenueRecognitionService.createContract(
      body.salesOrderId,
      body.customerId || "unknown",
      body.customerName,
      body.description,
      body.contractPrice,
      body.totalEstimatedCost,
      new Date(body.estimatedCompletionDate),
      body.method,
      body.overTimeCriterion,
      body.userId,
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 })
  }
}
