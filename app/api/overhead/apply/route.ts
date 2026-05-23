import { NextRequest, NextResponse } from "next/server"
import { OverheadService } from "@/lib/services/overhead-service"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await OverheadService.applyOverheadToWorkOrder(
      body.workOrderId,
      body.actualActivity,
      body.pohr,
      body.fiscalYear,
      body.userId,
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to apply overhead" }, { status: 500 })
  }
}
