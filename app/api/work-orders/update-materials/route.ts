import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { ACCOUNT_CODES } from "@/lib/accounting/account-types"

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

// Function to automatically sync inventory values with Chart of Accounts
async function syncInventoryWithChartOfAccounts() {
  try {
    console.log("🔄 Auto-syncing inventory with Chart of Accounts...")
    
    const now = new Date()
    
    // Calculate total inventory value from acc_inventory_items
    const inventorySnapshot = await db.collection(COLLECTIONS.INVENTORY_ITEMS).get()
    
    let totalInventoryValue = 0
    inventorySnapshot.docs.forEach(doc => {
      const data = doc.data()
      const itemValue = (data.quantity_on_hand || 0) * (data.cost_per_unit || 0)
      totalInventoryValue += itemValue
    })
    
    // Update INVENTORY_RAW account balance
    const inventoryRawRef = db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).doc('INVENTORY_RAW')
    await inventoryRawRef.update({
      balance: totalInventoryValue,
      last_updated: now
    })
    
    // Also update CASH account balance based on journal entries
    await syncCashBalance()
    
    console.log(`✅ Auto-synced INVENTORY_RAW balance to EGP ${totalInventoryValue.toLocaleString()}`)
  } catch (error) {
    console.error("Error auto-syncing inventory with Chart of Accounts:", error)
  }
}

// Function to sync CASH balance from journal entries
async function syncCashBalance() {
  try {
    console.log("🔄 Auto-syncing CASH balance...")
    
    const now = new Date()
    
    // Calculate CASH balance from journal entries
    const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).get()
    
    let cashBalance = 0
    journalSnapshot.docs.forEach(doc => {
      const entry = doc.data() as JournalDocument
      if (entry.entries) {
        entry.entries.forEach((subEntry: JournalEntry) => {
          if (subEntry.account_id === 'CASH') {
            cashBalance += (subEntry.debit || 0) - (subEntry.credit || 0)
          }
        })
      }
    })
    
    // Update CASH account balance
    const cashRef = db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).doc('CASH')
    await cashRef.update({
      balance: cashBalance,
      last_updated: now
    })
    
    console.log(`✅ Auto-synced CASH balance to EGP ${cashBalance.toLocaleString()}`)
  } catch (error) {
    console.error("Error auto-syncing CASH balance:", error)
  }
}

export async function POST(request: Request) {
  try {
    const { workOrderId, materials, laborHours, laborCost } = await request.json()
    
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Work Order ID is required" },
        { status: 400 }
      )
    }

    // Calculate total material cost
    const totalMaterialCost = materials?.reduce((sum: number, material: any) => 
      sum + (material.qty * material.cost), 0) || 0

    // Update work order with materials and labor
    const updateData = {
      raw_materials_used: materials || [],
      labor_hours: laborHours || 0,
      labor_cost: laborCost || 0,
      material_cost: totalMaterialCost,
      total_cost: totalMaterialCost + (laborCost || 0),
      updated_at: new Date()
    }

    await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update(updateData)

    // Process each material usage
    if (materials && materials.length > 0) {
      for (const material of materials) {
        // 1. Deduct inventory quantity
        const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(material.item_id)
        const inventoryDoc = await inventoryRef.get()
        
        if (inventoryDoc.exists) {
          const currentQty = inventoryDoc.data()?.quantity_on_hand || 0
          const newQty = Math.max(0, currentQty - material.qty) // Prevent negative quantities
          
          await inventoryRef.update({
            quantity_on_hand: newQty,
            last_updated: new Date()
          })

          // 2. Create inventory movement record
          const movement = {
            item_id: material.item_id,
            item_name: inventoryDoc.data()?.name || 'Unknown Item',
            movement_type: 'usage',
            quantity: -material.qty, // Negative for usage
            unit_cost: material.cost,
            total_cost: material.qty * material.cost,
            reason: 'Work Order Material Usage',
            reference: workOrderId,
            created_at: new Date(),
            created_by: 'system'
          }
          
          await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS).add(movement)
        }
      }

      // 3. Create balanced journal entry for material issue (DR WIP / CR Raw Materials)
      const journalEntry = {
        date: new Date(),
        entries: materials.flatMap((material: any) => {
          const cost = material.qty * (material.cost || 0)
          return [
            {
              account_id: ACCOUNT_CODES.INVENTORY_WIP,
              debit: cost,
              credit: 0,
              description: `Material issue: ${material.item_id} - ${material.qty} units to WIP`,
            },
            {
              account_id: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
              debit: 0,
              credit: cost,
              description: `Material consumed: ${material.item_id} - ${material.qty} units`,
            },
          ]
        }),
        linked_doc: workOrderId,
        created_at: new Date(),
        type: "MATERIAL_ISSUE_TO_WIP",
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).add(journalEntry)
    }

    // Create journal entry for labor
    if (laborCost && laborCost > 0) {
      const laborJournalEntry = {
        date: new Date(),
        entries: [
          { account_id: ACCOUNT_CODES.INVENTORY_WIP, debit: laborCost, credit: 0, description: `Labor cost for work order ${workOrderId}` },
          { account_id: ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION, debit: 0, credit: laborCost, description: `Labor cost for work order ${workOrderId}` }
        ],
        linked_doc: workOrderId,
        created_at: new Date()
      }
      
      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).add(laborJournalEntry)
    }

    // Auto-sync Chart of Accounts with current inventory values
    await syncInventoryWithChartOfAccounts()

    return NextResponse.json({ 
      success: true, 
      workOrderId,
      totalMaterialCost,
      totalCost: totalMaterialCost + (laborCost || 0)
    })

  } catch (error) {
    console.error("Error updating work order materials/labor:", error)
    return NextResponse.json(
      { error: "Failed to update work order" },
      { status: 500 }
    )
  }
}
