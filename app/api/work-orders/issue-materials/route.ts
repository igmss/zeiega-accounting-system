import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    const { workOrderId, materials } = await request.json()
    
    if (!workOrderId || !materials || !Array.isArray(materials)) {
      return NextResponse.json(
        { error: "Work order ID and materials array are required" },
        { status: 400 }
      )
    }
    
    const serviceDb = getServiceClient()
    
    const { data: workOrder, error: woError } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .eq("id", workOrderId)
      .single()
    
    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      )
    }
    
    const totalMaterialCost = materials.reduce((sum: number, material: any) => {
      return sum + (material.qty * material.cost)
    }, 0)
    
    await serviceDb.from(TABLES.WORK_ORDERS).update({
      raw_materials_used: materials,
      status: "in_progress",
      updated_at: new Date().toISOString()
    }).eq("id", workOrderId)
    
    const accountingMaterials = []
    const inventoryRefs: Array<{ id: string; qty: number }> = []
    for (const material of materials) {
      const { data: inventoryData } = await serviceDb
        .from(TABLES.INVENTORY_ITEMS)
        .select("*")
        .eq("sku", material.item_id)
        .limit(1)
        .single()
      
      const itemName = inventoryData ? (inventoryData.name || 'Unknown Item') : 'Unknown Item'
      
      if (inventoryData) {
        inventoryRefs.push({ id: inventoryData.id, qty: material.qty })
      }
      
      accountingMaterials.push({
        itemId: material.item_id,
        itemName: itemName,
        quantity: material.qty,
        unitCost: material.cost || 0
      })
    }

    if (accountingMaterials.length > 0) {
      const accountingResult = await EnhancedAccountingService.recordMaterialIssue(
        workOrderId,
        accountingMaterials
      )

      if (!accountingResult.success) {
        return NextResponse.json(
          { error: `Accounting entry failed: ${accountingResult.error}` },
          { status: 400 }
        )
      }
    }
    
    for (const inv of inventoryRefs) {
      const { data: currentInv } = await serviceDb
        .from(TABLES.INVENTORY_ITEMS)
        .select("quantity_on_hand")
        .eq("id", inv.id)
        .single()
      
      const currentQty = currentInv?.quantity_on_hand || 0
      await serviceDb.from(TABLES.INVENTORY_ITEMS).update({
        quantity_on_hand: currentQty - inv.qty,
        last_updated: new Date().toISOString()
      }).eq("id", inv.id)
    }
    
    await syncInventoryWithChartOfAccounts()
    
    return NextResponse.json({
      success: true,
      message: "Materials issued successfully",
      workOrderId,
      totalCost: totalMaterialCost,
      materialsIssued: materials.length
    })
    
  } catch (error) {
    console.error("Error issuing materials:", error)
    return NextResponse.json(
      { error: "Failed to issue materials" },
      { status: 500 }
    )
  }
}

async function syncInventoryWithChartOfAccounts() {
  try {
    const serviceDb = getServiceClient()

    const { data: inventoryItems } = await serviceDb
      .from(TABLES.INVENTORY_ITEMS)
      .select("*")

    if (!inventoryItems) return

    const rawMaterialsValue = inventoryItems
      .filter((item: any) => item.type === 'raw')
      .reduce((sum: number, item: any) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    const finishedGoodsValue = inventoryItems
      .filter((item: any) => item.type === 'finished')
      .reduce((sum: number, item: any) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    const wipValue = inventoryItems
      .filter((item: any) => item.type === 'wip')
      .reduce((sum: number, item: any) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    const accountsToUpdate = [
      { account_id: "INVENTORY_RAW", balance: rawMaterialsValue },
      { account_id: "INVENTORY_WIP", balance: wipValue },
      { account_id: "INVENTORY_FINISHED", balance: finishedGoodsValue }
    ]

    for (const accountUpdate of accountsToUpdate) {
      const { data: accountDoc } = await serviceDb
        .from(TABLES.CHART_OF_ACCOUNTS)
        .select("*")
        .eq("id", accountUpdate.account_id)
        .single()
      
      if (accountDoc) {
        await serviceDb.from(TABLES.CHART_OF_ACCOUNTS).update({
          balance: accountUpdate.balance,
          last_updated: new Date().toISOString()
        }).eq("id", accountUpdate.account_id)
      }
    }

    console.log(`Updated inventory balances - Raw: ${rawMaterialsValue}, WIP: ${wipValue}, Finished: ${finishedGoodsValue}`)
  } catch (error) {
    console.error("Error syncing inventory with chart of accounts:", error)
  }
}
