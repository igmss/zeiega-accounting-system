import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
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

    const inventoryData = inventoryItems.map((item: any) => ({
      sku: item.id,
      name: item.name,
      type: item.type,
      quantity: item.quantity_on_hand || 0,
      cost_per_unit: item.cost_per_unit || 0,
      total_value: (item.quantity_on_hand || 0) * (item.cost_per_unit || 0),
      last_movement: item.last_updated || item.createdAt || new Date().toISOString(),
      turnover_days: 0,
    }))

    if (inventoryData.length === 0) {
      return NextResponse.json({
        inventoryData: [],
        inventoryByType: [
          { name: "Raw Materials", value: 0, color: "#164e63" },
          { name: "Work in Progress", value: 0, color: "#f59e0b" },
          { name: "Finished Goods", value: 0, color: "#f97316" },
        ],
        totalInventoryValue: 0,
        summary: {
          rawMaterialsValue: 0,
          wipValue: 0,
          finishedGoodsValue: 0,
          totalInventoryValue: 0,
          itemCount: 0,
          lowStockItems: 0,
        }
      })
    }

    const rawMaterialsValue = inventoryData
      .filter((item: any) => item.type === 'raw')
      .reduce((sum: any, item: any) => sum + item.total_value, 0)

    const finishedGoodsValue = inventoryData
      .filter((item: any) => item.type === 'finished')
      .reduce((sum: any, item: any) => sum + item.total_value, 0)

    const wipValue = inventoryData
      .filter((item: any) => item.type === 'wip')
      .reduce((sum: any, item: any) => sum + item.total_value, 0)

    const totalInventoryValue = rawMaterialsValue + finishedGoodsValue + wipValue

    const inventoryByType = [
      { name: "Raw Materials", value: rawMaterialsValue, color: "#164e63" },
      { name: "Work in Progress", value: wipValue, color: "#f59e0b" },
      { name: "Finished Goods", value: finishedGoodsValue, color: "#f97316" },
    ]

    const reportData = {
      inventoryData,
      inventoryByType,
      totalInventoryValue,
      summary: {
        rawMaterialsValue,
        wipValue,
        finishedGoodsValue,
        totalInventoryValue,
        itemCount: inventoryData.length,
        lowStockItems: inventoryData.filter((item: any) => item.quantity < 10).length,
      }
    }

    return NextResponse.json(reportData)
  } catch (error) {
    console.error("Error generating inventory valuation report:", error)
    return NextResponse.json(
      { error: "Failed to generate inventory valuation report" },
      { status: 500 }
    )
  }
}
