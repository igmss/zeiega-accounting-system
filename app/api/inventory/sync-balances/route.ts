import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { ACCOUNT_CODES } from "@/lib/accounting/account-types"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"

export async function POST() {
  try {
    const auth = await requirePermission("inventory:create")
    if (!auth.authorized) return auth.response

    console.log("Starting inventory balance sync...")

    // Fetch all inventory items
    const { data: inventoryItems, error } = await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .select("*")

    if (error) throw error

    const items: any[] = inventoryItems || []

    // Calculate totals by type with proper account codes
    const rawMaterialsValue = items
      .filter(item => item.type === 'raw')
      .reduce((sum, item) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    const wipValue = items
      .filter(item => item.type === 'wip')
      .reduce((sum, item) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    const finishedGoodsValue = items
      .filter(item => item.type === 'finished')
      .reduce((sum, item) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    console.log(`Calculated values - Raw: ${rawMaterialsValue}, WIP: ${wipValue}, Finished: ${finishedGoodsValue}`)

    // Create a single balanced journal entry using EnhancedAccountingService
    const totalInventoryValue = rawMaterialsValue + wipValue + finishedGoodsValue

    if (totalInventoryValue > 0) {
      const lines: any[] = [
        {
          accountCode: ACCOUNT_CODES.INVENTORY_ADJUSTMENTS,
          accountName: "Inventory Adjustments",
          debit: totalInventoryValue,
          credit: 0,
          description: "Inventory balance sync - Total inventory value",
        },
      ]

      if (rawMaterialsValue > 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
          accountName: "Raw Materials - Fabric",
          debit: 0,
          credit: rawMaterialsValue,
          description: "Sync - Raw materials inventory value",
        })
      }

      if (wipValue > 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.INVENTORY_WIP,
          accountName: "Work in Progress Inventory",
          debit: 0,
          credit: wipValue,
          description: "Sync - WIP inventory value",
        })
      }

      if (finishedGoodsValue > 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.INVENTORY_FINISHED_GOODS,
          accountName: "Finished Goods Inventory",
          debit: 0,
          credit: finishedGoodsValue,
          description: "Sync - Finished goods inventory value",
        })
      }

      await EnhancedAccountingService.createJournalEntry(
        "INVENTORY_ADJUSTMENT" as any,
        lines,
        "inventory_sync",
        "Inventory balance sync from physical count"
      )
    }

    return NextResponse.json({
      success: true,
      message: "Inventory balances synced successfully",
      balances: {
        rawMaterialsValue,
        wipValue,
        finishedGoodsValue,
        totalInventoryValue
      }
    })

  } catch (error) {
    console.error("Error syncing inventory balances:", error)
    return NextResponse.json(
      { error: "Failed to sync inventory balances" },
      { status: 500 }
    )
  }
}
