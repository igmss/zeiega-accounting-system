import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
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

    const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(itemId)
    const inventoryDoc = await inventoryRef.get()

    if (!inventoryDoc.exists) {
      return NextResponse.json(
        { error: "Inventory item not found" },
        { status: 404 }
      )
    }

    const currentData = inventoryDoc.data()
    const currentQty = currentData?.quantity_on_hand || 0
    const unitCost = currentData?.cost_per_unit || 0
    const itemName = currentData?.name || "Unknown Item"
    const itemCategory = currentData?.category || "raw_materials"

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

    await inventoryRef.update({
      quantity_on_hand: newQty,
      last_updated: new Date()
    })

    const movementId = `MOV-${Date.now()}`
    await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS).doc(movementId).set({
      item_id: itemId,
      item_name: itemName,
      movement_type: 'adjustment',
      quantity: actualAdjustment,
      unit_cost: unitCost,
      total_cost: Math.abs(actualAdjustment) * unitCost,
      reason: reason,
      reference: `ADJ-${Date.now()}`,
      created_at: new Date(),
      created_by: auth.user?.id || 'manual'
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
