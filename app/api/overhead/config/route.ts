import { NextRequest, NextResponse } from "next/server"
import { OverheadService } from "@/lib/services/overhead-service"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { searchParams } = new URL(req.url)
    const fiscalYear = searchParams.get("fiscalYear")
      ? Number(searchParams.get("fiscalYear"))
      : undefined

    const configs = await OverheadService.getOverheadConfigs(fiscalYear)
    return NextResponse.json({ configs })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch configs" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("accounting:create")
  if (!auth.authorized) return auth.response
  try {
    const body = await req.json()
    const result = await OverheadService.createOverheadConfig(
      body.fiscalYear,
      body.allocationBase,
      body.estimatedTotalOH,
      body.estimatedActivityLevel,
      body.department,
      body.userId,
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to create config" }, { status: 500 })
  }
}
