import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission } from "@/lib/auth"
import { CentralizedAccountingService } from "@/lib/services/centralized-accounting-service"

// TypeScript interfaces for journal entries
interface JournalEntry {
  account_id: string
  debit: number
  credit: number
  description: string
}

interface JournalDocument {
  entries: JournalEntry[]
  date: any
  linked_doc?: string
  created_at: any
}


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

    // Get current inventory item
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

    // Calculate new quantity based on adjustment type
    let newQty = currentQty
    let actualAdjustment = 0

    if (adjustmentType === 'set') {
      // Set to specific quantity
      newQty = adjustmentQty
      actualAdjustment = adjustmentQty - currentQty
    } else if (adjustmentType === 'add') {
      // Add to current quantity
      newQty = currentQty + adjustmentQty
      actualAdjustment = adjustmentQty
    } else if (adjustmentType === 'subtract') {
      // Subtract from current quantity
      newQty = Math.max(0, currentQty - adjustmentQty)
      actualAdjustment = -adjustmentQty
    }

    // Update inventory quantity
    await inventoryRef.update({
      quantity_on_hand: newQty,
      last_updated: new Date()
    })

    // Create inventory movement record
    const movement = {
      item_id: itemId,
      item_name: currentData?.name || 'Unknown Item',
      movement_type: 'adjustment',
      quantity: actualAdjustment,
      unit_cost: unitCost,
      total_cost: Math.abs(actualAdjustment) * unitCost,
      reason: reason,
      reference: `ADJ-${Date.now()}`,
      created_at: new Date(),
      created_by: 'manual'
    }

    await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS).add(movement)

    // Create journal entry for inventory adjustment
    const adjustmentValue = Math.abs(actualAdjustment) * unitCost

    if (adjustmentValue > 0) {
      // Determine Contra Account (Balancing Leg)
      const isOpeningBalance = reason.toLowerCase().includes('opening') || reason.toLowerCase().includes('initial')
      
      let contraAccountId = "5301" // Default COGS fallback
      
      if (isOpeningBalance) {
        contraAccountId = "3001" // Capital
      } else if (actualAdjustment < 0) {
        contraAccountId = "6207" // Inventory Shrinkage & Loss
      } else if (actualAdjustment > 0) {
        contraAccountId = "6208" // Inventory Gain / Count Surplus
      }

      const assetAccountId = "1201" // Raw Materials default. Should ideally come from item category.

      const journalEntry = {
        date: new Date(),
        description: `Inventory adjustment: ${currentData?.name} (${reason})`,
        reference: `ADJ-${Date.now()}`,
        type: 'INVENTORY_ADJ',
        entries: [
          // 1. Inventory Asset Leg
          {
            account_id: assetAccountId,
            debit: actualAdjustment > 0 ? adjustmentValue : 0, // Increase Asset if Adding
            credit: actualAdjustment < 0 ? adjustmentValue : 0, // Decrease Asset if Subtracting
            description: `Inventory: ${currentData?.name} - ${actualAdjustment > 0 ? '+' : ''}${actualAdjustment} units`
          },
          // 2. Contra Account Leg (Expense or Equity)
          {
            account_id: contraAccountId,
            debit: actualAdjustment < 0 ? adjustmentValue : 0, // Debit Expense if Lost (Asset Decreased)
            credit: actualAdjustment > 0 ? adjustmentValue : 0, // Credit Income/Equity if Gained (Asset Increased)
            description: `Adjustment: ${reason}`
          }
        ],
        linked_doc: movement.reference,
        created_at: new Date(),
        total_debits: adjustmentValue,
        total_credits: adjustmentValue,
        account_ids: [assetAccountId, contraAccountId],
        status: 'posted'
      }
      journalEntry.id = `INV-ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(journalEntry.id).set(journalEntry)
      
      // Sync affected account balances
      await CentralizedAccountingService.syncMultipleAccountBalances([assetAccountId, contraAccountId])
    }


    return NextResponse.json({
      success: true,
      message: "Inventory adjustment completed successfully",
      adjustment: {
        itemId,
        itemName: currentData?.name,
        previousQty: currentQty,
        newQty: newQty,
        adjustment: actualAdjustment,
        reason: reason
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
