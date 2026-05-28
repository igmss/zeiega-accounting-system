import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { formatCurrency } from "@/lib/utils"
import { ACCOUNT_CODES, isDebitNormalBalance } from "@/lib/accounting/account-types"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"

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
    
    console.log(`✅ Auto-synced INVENTORY_RAW balance to ${formatCurrency(totalInventoryValue)}`)
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
    
    console.log(`✅ Auto-synced CASH balance to ${formatCurrency(cashBalance)}`)
  } catch (error) {
    console.error("Error auto-syncing CASH balance:", error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("work-orders:create")
    if (!auth.authorized) return auth.response

    const { workOrderId, materials, laborHours, laborCost, overheadCost } = await request.json()
    
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Work Order ID is required" },
        { status: 400 }
      )
    }

    const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId)
    const workOrderDoc = await workOrderRef.get()
    
    if (!workOrderDoc.exists) {
      return NextResponse.json(
        { error: "Work Order not found" },
        { status: 404 }
      )
    }
    
    const workOrderData = workOrderDoc.data()
    const previousMaterials = workOrderData?.raw_materials_used || []

    // 1. Revert previous inventory deductions
    for (const prevMaterial of previousMaterials) {
      if (prevMaterial.item_id && prevMaterial.qty) {
        const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(prevMaterial.item_id)
        const inventoryDoc = await inventoryRef.get()
        if (inventoryDoc.exists) {
          const currentQty = inventoryDoc.data()?.quantity_on_hand || 0
          await inventoryRef.update({
            quantity_on_hand: currentQty + prevMaterial.qty,
            last_updated: new Date()
          })
        }
      }
    }

    // 2. Delete previous inventory movements for this work order
    const prevMovementsRef = await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS)
      .where("reference", "==", workOrderId)
      .get()
    const prevMovementsRelated = await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS)
      .where("related_doc", "==", workOrderId)
      .get()
    
    const movementsBatch = db.batch()
    const uniqueMovementRefs = new Set()
    
    const addMovementToBatch = (doc: any) => {
      if (!uniqueMovementRefs.has(doc.id)) {
        uniqueMovementRefs.add(doc.id)
        movementsBatch.delete(doc.ref)
      }
    }
    
    prevMovementsRef.docs.forEach(addMovementToBatch)
    prevMovementsRelated.docs.forEach(addMovementToBatch)
    await movementsBatch.commit()

    // 3. Delete previous journal entries and reverse their balance cache effects
    const prevByRef = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
      .where("reference_doc", "==", workOrderId)
      .get()
    const prevByLink = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
      .where("linked_doc", "==", workOrderId)
      .get()
    
    const entriesToVoid: any[] = []
    const uniqueIds = new Set()
    
    const addEntryToVoid = (doc: any) => {
      if (!uniqueIds.has(doc.id)) {
        uniqueIds.add(doc.id)
        entriesToVoid.push(doc)
      }
    }
    
    prevByRef.docs.forEach(addEntryToVoid)
    prevByLink.docs.forEach(addEntryToVoid)

    const balanceAdjustments: Record<string, { debits: number; credits: number }> = {}
    
    for (const doc of entriesToVoid) {
      const data = doc.data()
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          const accountCode = entry.account_id
          if (!balanceAdjustments[accountCode]) {
            balanceAdjustments[accountCode] = { debits: 0, credits: 0 }
          }
          balanceAdjustments[accountCode].debits += entry.debit || 0
          balanceAdjustments[accountCode].credits += entry.credit || 0
        }
      }
    }

    const deleteBatch = db.batch()
    for (const doc of entriesToVoid) {
      deleteBatch.delete(doc.ref)
    }
    await deleteBatch.commit()

    // Adjust the balance cache for deleted entries
    for (const [accountCode, adjustment] of Object.entries(balanceAdjustments)) {
      const balRef = db.collection(COLLECTIONS.ACCOUNT_BALANCES).doc(accountCode)
      const balDoc = await balRef.get()
      if (balDoc.exists) {
        const existing = balDoc.data()!
        const newTotalDebits = Math.max(0, (existing.totalDebits || 0) - adjustment.debits)
        const newTotalCredits = Math.max(0, (existing.totalCredits || 0) - adjustment.credits)
        
        const isDebit = isDebitNormalBalance(accountCode)
        const balance = isDebit
          ? newTotalDebits - newTotalCredits
          : newTotalCredits - newTotalDebits
        
        await balRef.update({
          totalDebits: newTotalDebits,
          totalCredits: newTotalCredits,
          balance,
          updatedAt: new Date()
        })
      }
    }

    // 4. Process each new material usage
    const accountingMaterials: any[] = []
    const cleanMaterials = Array.isArray(materials) ? materials : []

    for (const material of cleanMaterials) {
      if (!material.item_id || !material.qty) continue

      const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(material.item_id)
      const inventoryDoc = await inventoryRef.get()
      const itemName = inventoryDoc.exists ? (inventoryDoc.data()?.name || 'Unknown Item') : 'Unknown Item'
      
      if (inventoryDoc.exists) {
        const currentQty = inventoryDoc.data()?.quantity_on_hand || 0
        const newQty = Math.max(0, currentQty - material.qty) // Prevent negative quantities
        
        await inventoryRef.update({
          quantity_on_hand: newQty,
          last_updated: new Date()
        })

        // Create inventory movement record
        const movement = {
          item_id: material.item_id,
          item_name: itemName,
          movement_type: 'usage',
          quantity: -material.qty,
          unit_cost: material.cost || 0,
          total_cost: material.qty * (material.cost || 0),
          reason: 'Work Order Material Usage',
          reference: workOrderId,
          created_at: new Date(),
          created_by: 'system'
        }
        
        await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS).add(movement)
        
        accountingMaterials.push({
          itemId: material.item_id,
          itemName: itemName,
          quantity: material.qty,
          unitCost: material.cost || 0
        })
      }
    }

    // 5. Calculate new costs
    const totalMaterialCost = cleanMaterials.reduce((sum: number, material: any) => 
      sum + (material.qty * (material.cost || 0)), 0)

    const finalLaborCost = laborCost || 0
    const finalOverheadCost = overheadCost !== undefined ? overheadCost : (workOrderData?.overhead_cost || 0)
    const totalCost = totalMaterialCost + finalLaborCost + finalOverheadCost

    // 6. Update work order document with new costs
    const updatedWOData = {
      raw_materials_used: cleanMaterials,
      labor_hours: laborHours || 0,
      labor_cost: finalLaborCost,
      overhead_cost: finalOverheadCost,
      material_cost: totalMaterialCost,
      total_cost: totalCost,
      updated_at: new Date()
    }

    await workOrderRef.update(updatedWOData)

    // 7. Record balanced journal entries using EnhancedAccountingService
    if (accountingMaterials.length > 0) {
      await EnhancedAccountingService.recordMaterialIssue(workOrderId, accountingMaterials)
    }

    if (laborHours && finalLaborCost) {
      const laborRate = laborHours > 0 ? (finalLaborCost / laborHours) : 50
      await EnhancedAccountingService.recordLaborApplied(workOrderId, laborHours, laborRate)
    } else if (finalLaborCost > 0) {
      await EnhancedAccountingService.recordLaborApplied(workOrderId, 1, finalLaborCost)
    }

    if (finalOverheadCost > 0) {
      await EnhancedAccountingService.recordOverheadApplied(workOrderId, finalOverheadCost)
    }

    // 8. Auto-sync Chart of Accounts with current inventory values
    await syncInventoryWithChartOfAccounts()

    return NextResponse.json({ 
      success: true, 
      workOrderId,
      totalMaterialCost,
      totalCost
    })

  } catch (error) {
    console.error("Error updating work order materials/labor/overhead:", error)
    return NextResponse.json(
      { error: "Failed to update work order" },
      { status: 500 }
    )
  }
}
