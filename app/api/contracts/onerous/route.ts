import { NextRequest, NextResponse } from "next/server"
import { RevenueRecognitionService } from "@/lib/services/revenue-recognition-service"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const contract = await RevenueRecognitionService.getContract(body.contractId)
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 })
    }

    const isOnerous = contract.totalEstimatedCost > contract.contractPrice
    return NextResponse.json({
      isOnerous,
      expectedLoss: isOnerous ? contract.totalEstimatedCost - contract.contractPrice : 0,
      contract,
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to check contract" }, { status: 500 })
  }
}
