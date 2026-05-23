import { NextRequest, NextResponse } from "next/server"
import { VarianceService } from "@/lib/services/variance-service"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.workOrderId) {
      // Analyze variance for a work order
      const standard = await VarianceService.getStandardCost(body.designId || "")
      if (!standard) {
        return NextResponse.json({
          success: false,
          error: "No standard costs found for this design. Set them first.",
        }, { status: 400 })
      }

      const result = await VarianceService.calculateJobVariance(body.workOrderId, standard)
      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    return NextResponse.json({ error: "Provide workOrderId" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to analyze" }, { status: 500 })
  }
}
