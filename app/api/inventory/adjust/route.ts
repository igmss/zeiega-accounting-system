import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission } from "@/lib/auth"
import { InventoryAccountingService } from "@/lib/services/inventory-accounting-service"

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("inventory:create")
    if (!auth.authorized) return auth.response

    const { itemId, adjustmentQty, reason, adjustmentType } = await request.json()

    if (!itemId || adjustmentQty === undefined || !reason) {
      return NextResponse.json(
        { error: "Item ID, adjustment quantity, and reason are required" },
        { status: 400 }
      )
    }

    const { data: inventoryDoc, error: fetchError } = await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .select("*")
      .eq("id", itemId)
      .single()

    if (fetchError || !inventoryDoc) {
      return NextResponse.json(
        { error: "Inventory item not found" },
        { status: 404 }
      )
    }

    const currentData = inventoryDoc
    const currentQty = currentData?.quantity_on_hand || 0
    const unitCost = currentData?.cost_per_unit || 0
    const itemName = currentData?.name || "Unknown Item"
    const itemCategory = currentData?.type || "raw"

    let newQty = currentQty
    let actualAdjustment = 0

    if (adjustmentType === 'set') {
      newQty = adjustmentQty
      actualAdjustment = adjustmentQty - currentQty
    } else if (adjustmentType === 'add') {
      newQty = currentQty + adjustmentQty
      actualAdjustment = adjustmentQty
    } else if (adjustmentType === 'subtract') {
      newQty = Math.max(0, currentQty - adjustmentQty)
      actualAdjustment = -adjustmentQty
    }

    await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .update({
        quantity_on_hand: newQty,
        updated_at: new Date().toISOString()
      })
      .eq("id", itemId)

    await getServiceClient()
      .from(TABLES.INVENTORY_MOVEMENTS)
      .insert({
        item_id: itemId,
        sku: currentData?.sku || itemId,
        qty: actualAdjustment,
        type: 'adjustment',
        related_doc: `ADJ-${Date.now()}`,
        notes: `${reason} | Item: ${itemName} | Unit cost: ${unitCost}`,
        created_at: new Date().toISOString()
      })

    const adjustmentValue = Math.abs(actualAdjustment) * unitCost

    let entryId: string | undefined
    if (adjustmentValue > 0) {
      const result = await InventoryAccountingService.recordInventoryAdjustmentEntry(
        itemName,
        itemCategory,
        actualAdjustment,
        adjustmentValue,
        reason,
        auth.user?.id
      )
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Failed to create adjustment journal entry" },
          { status: 500 }
        )
      }
      entryId = result.entryId
    }

    return NextResponse.json({
      success: true,
      message: "Inventory adjustment completed successfully",
      adjustment: {
        itemId,
        itemName,
        previousQty: currentQty,
        newQty: newQty,
        adjustment: actualAdjustment,
        reason,
        entryId,
      }
    })

  } catch (error) {
    console.error("Error adjusting inventory:", error)
    return NextResponse.json(
      { error: "Failed to adjust inventory" },
      { status: 500 }
    )
  }
}
