import { NextRequest, NextResponse } from "next/server"
import { FiscalCloseService } from "@/lib/services/fiscal-close-service"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await FiscalCloseService.executeYearEndClose(
      body.fiscalYear,
      body.userId,
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to close fiscal year" }, { status: 500 })
  }
}
