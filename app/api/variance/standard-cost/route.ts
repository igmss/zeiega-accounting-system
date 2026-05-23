import { NextRequest, NextResponse } from "next/server"
import { VarianceService } from "@/lib/services/variance-service"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await VarianceService.setStandardCost(
      body.designId,
      body.designName || body.designId,
      body,
      body.userId,
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to save standard costs" }, { status: 500 })
  }
}
