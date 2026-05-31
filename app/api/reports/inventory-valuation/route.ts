import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"
import { requirePermission } from "@/lib/auth"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requirePermission("reports:view")
    if (!auth.authorized) return auth.response

    const { data: inventoryItems, error } = await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .select("*")

    if (error) throw error

    const inventoryData = (inventoryItems || []).map((item: any) => ({
      sku: item.sku || item.id,
      name: item.name,
      type: item.type || "raw",
      quantity: item.quantity_on_hand || 0,
      cost_per_unit: item.cost_per_unit || 0,
      total_value: (item.quantity_on_hand || 0) * (item.cost_per_unit || 0),
    }))

    const rawMaterialsValue = inventoryData
      .filter((item: any) => item.type === 'raw')
      .reduce((sum: any, item: any) => sum + item.total_value, 0)

    const finishedGoodsInventoried = inventoryData
      .filter((item: any) => item.type === 'finished')
      .reduce((sum: any, item: any) => sum + item.total_value, 0)

    const now = new Date()
    const wipMat = await FinancialStatementsService.getAccountBalance("1710", undefined, now)
    const wipLabor = await FinancialStatementsService.getAccountBalance("1711", undefined, now)
    const wipOH = await FinancialStatementsService.getAccountBalance("1712", undefined, now)
    const wipValue = wipMat + wipLabor + wipOH

    const fgGL = await FinancialStatementsService.getAccountBalance("1220", undefined, now)
    const finishedGoodsValue = finishedGoodsInventoried + Math.max(0, fgGL)

    const totalInventoryValue = rawMaterialsValue + finishedGoodsValue + wipValue

    const summary = {
      rawMaterialsValue,
      wipValue,
      finishedGoodsValue,
      totalInventoryValue,
      itemCount: inventoryData.length,
      lowStockItems: inventoryData.filter((item: any) => item.quantity < 10).length,
    }

    return NextResponse.json({
      inventoryData,
      inventoryByType: [
        { name: "Raw Materials", value: rawMaterialsValue, color: "#164e63" },
        { name: "Work in Progress", value: wipValue, color: "#f59e0b" },
        { name: "Finished Goods", value: finishedGoodsValue, color: "#f97316" },
      ],
      totalInventoryValue,
      summary,
    })
  } catch (error) {
    console.error("Error generating inventory valuation report:", error)
    return NextResponse.json(
      { error: "Failed to generate inventory valuation report" },
      { status: 500 }
    )
  }
}
