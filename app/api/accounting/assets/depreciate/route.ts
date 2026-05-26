import { NextResponse } from "next/server"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { requirePermission } from "@/lib/auth"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { assetEntryId, year, month } = body

        if (!assetEntryId) {
            return NextResponse.json({ error: "Asset Entry ID is required" }, { status: 400 })
        }

        const now = new Date()
        const targetYear = year || now.getFullYear()
        const targetMonth = month !== undefined ? month : now.getMonth()

        const result = await EnhancedAccountingService.recordDepreciation(
            assetEntryId,
            targetYear,
            targetMonth
        )

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: "Depreciation recorded successfully",
            entryId: result.entryId
        })

    } catch (error) {
        console.error("Error in depreciation API:", error)
        return NextResponse.json(
            { error: "Failed to process depreciation" },
            { status: 500 }
        )
    }
}
