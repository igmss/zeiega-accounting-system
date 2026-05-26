import { NextRequest, NextResponse } from "next/server"
import { OverheadService } from "@/lib/services/overhead-service"
import { requirePermission } from "@/lib/auth/auth-helpers"

export async function POST(req: NextRequest) {
  const auth = await requirePermission("accounting:create")
  if (!auth.authorized) return auth.response
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
