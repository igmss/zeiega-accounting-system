import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

export async function GET() {
  try {
    // Fetch inventory items
    const inventorySnapshot = await db.collection(COLLECTIONS.INVENTORY_ITEMS).get()
    const inventoryItems: any[] = inventorySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Calculate inventory valuation
    const inventoryData = inventoryItems.map(item => ({
      sku: item.id,
      name: item.name,
      type: item.type,
      quantity: item.quantity_on_hand || 0,
      cost_per_unit: item.cost_per_unit || 0,
      total_value: (item.quantity_on_hand || 0) * (item.cost_per_unit || 0),
      last_movement: item.last_updated || item.createdAt || new Date(),
      turnover_days: 0, // Would come from inventory movement analysis
    }))

    // If no inventory data, return empty structure
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

    // Calculate totals by type
    const rawMaterialsValue = inventoryData
      .filter(item => item.type === 'raw')
      .reduce((sum, item) => sum + item.total_value, 0)

    const finishedGoodsValue = inventoryData
      .filter(item => item.type === 'finished')
      .reduce((sum, item) => sum + item.total_value, 0)

    const wipValue = inventoryData
      .filter(item => item.type === 'wip')
      .reduce((sum, item) => sum + item.total_value, 0)

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
        lowStockItems: inventoryData.filter(item => item.quantity < 10).length,
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
