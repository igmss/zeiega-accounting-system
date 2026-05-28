import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { isDebitNormalBalance } from "@/lib/accounting/account-types"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"

 

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

    // 3. Delete only the journal entries that are being replaced
    const cleanMaterials = Array.isArray(materials) ? materials : []
    const jeTypesToDelete: string[] = []
    if (cleanMaterials.length > 0) jeTypesToDelete.push("MATERIAL_ISSUE_TO_WIP")
    if (laborHours && laborCost) jeTypesToDelete.push("LABOR_APPLIED")
    if (overheadCost > 0) jeTypesToDelete.push("OVERHEAD_APPLIED")

    if (jeTypesToDelete.length > 0) {
      const prevByRef = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
        .where("reference_doc", "==", workOrderId)
        .where("type", "in", jeTypesToDelete)
        .get()
      const prevByLink = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
        .where("linked_doc", "==", workOrderId)
        .where("type", "in", jeTypesToDelete)
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

      const deleteBatch = db.batch()
      for (const doc of entriesToVoid) {
        deleteBatch.delete(doc.ref)
      }
      await deleteBatch.commit()

      // Adjust the balance cache for deleted entries
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
    }

    // 4. Process each new material usage
    const accountingMaterials: any[] = []

    for (const material of cleanMaterials) {
      if (!material.item_id || !material.qty) continue

      const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(material.item_id)
      const inventoryDoc = await inventoryRef.get()
      const itemName = inventoryDoc.exists ? (inventoryDoc.data()?.name || 'Unknown Item') : 'Unknown Item'
      
      if (inventoryDoc.exists) {
        const currentQty = inventoryDoc.data()?.quantity_on_hand || 0
        const newQty = Math.max(0, currentQty - material.qty) // Prevent negative quantities
        const itemNameFromDoc = inventoryDoc.data()?.name || 'Unknown Item'
        
        await inventoryRef.update({
          quantity_on_hand: newQty,
          last_updated: new Date()
        })

        // Create inventory movement record
        const movement = {
          item_id: material.item_id,
          item_name: itemNameFromDoc,
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
      }

      // Always record the accounting entry, even if inventory item doesn't exist
      accountingMaterials.push({
        itemId: material.item_id,
        itemName: itemName,
        quantity: material.qty,
        unitCost: material.cost || 0
      })
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
      const matResult = await EnhancedAccountingService.recordMaterialIssue(workOrderId, accountingMaterials)
      if (!matResult.success) {
        throw new Error(`Material issue accounting failed: ${matResult.error}`)
      }
    }

    if (laborHours && finalLaborCost) {
      const laborRate = laborHours > 0 ? (finalLaborCost / laborHours) : 50
      const laborResult = await EnhancedAccountingService.recordLaborApplied(workOrderId, laborHours, laborRate)
      if (!laborResult.success) {
        throw new Error(`Labor applied accounting failed: ${laborResult.error}`)
      }
    } else if (finalLaborCost > 0) {
      const laborResult = await EnhancedAccountingService.recordLaborApplied(workOrderId, 1, finalLaborCost)
      if (!laborResult.success) {
        throw new Error(`Labor applied accounting failed: ${laborResult.error}`)
      }
    }

    if (finalOverheadCost > 0) {
      const ohResult = await EnhancedAccountingService.recordOverheadApplied(workOrderId, finalOverheadCost)
      if (!ohResult.success) {
        throw new Error(`Overhead applied accounting failed: ${ohResult.error}`)
      }
    }

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
