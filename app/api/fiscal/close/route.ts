import { NextRequest, NextResponse } from "next/server"
import { FiscalCloseService } from "@/lib/services/fiscal-close-service"
import { requireAdmin } from "@/lib/auth/auth-helpers"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response
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
