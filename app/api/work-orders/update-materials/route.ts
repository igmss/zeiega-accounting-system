import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { isDebitNormalBalance } from "@/lib/accounting/account-types"
import { requirePermission } from "@/lib/auth"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { JournalEntryService } from "@/lib/services/journal-entry-service"


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

    const serviceDb = getServiceClient()

    const { data: workOrderData, error: woError } = await serviceDb
      .from(TABLES.WORK_ORDERS)
      .select("*")
      .eq("id", workOrderId)
      .single()
    
    if (!workOrderData) {
      return NextResponse.json(
        { error: "Work Order not found" },
        { status: 404 }
      )
    }
    
    const previousMaterials = workOrderData.raw_materials_used || []

    // 1. Revert previous inventory deductions
    for (const prevMaterial of previousMaterials) {
      if (prevMaterial.item_id && prevMaterial.qty) {
        const { data: inventoryData } = await serviceDb
          .from(TABLES.INVENTORY_ITEMS)
          .select("*")
          .eq("sku", prevMaterial.item_id)
          .limit(1)
          .single()
        
        if (inventoryData) {
          const currentQty = inventoryData.quantity_on_hand || 0
          await serviceDb.from(TABLES.INVENTORY_ITEMS).update({
            quantity_on_hand: currentQty + prevMaterial.qty,
            last_updated: new Date().toISOString()
          }).eq("id", inventoryData.id)
        }
      }
    }

    // 2. Delete previous inventory movements for this work order
    const { data: prevMovementsRef } = await serviceDb
      .from(TABLES.INVENTORY_MOVEMENTS)
      .select("id")
      .eq("reference", workOrderId)
    
    const { data: prevMovementsRelated } = await serviceDb
      .from(TABLES.INVENTORY_MOVEMENTS)
      .select("id")
      .eq("related_doc", workOrderId)
    
    const uniqueMovementIds = new Set<string>()
    
    if (prevMovementsRef) {
      for (const doc of prevMovementsRef) {
        uniqueMovementIds.add(doc.id)
      }
    }
    if (prevMovementsRelated) {
      for (const doc of prevMovementsRelated) {
        uniqueMovementIds.add(doc.id)
      }
    }
    
    for (const id of uniqueMovementIds) {
      await serviceDb.from(TABLES.INVENTORY_MOVEMENTS).delete().eq("id", id)
    }

    // 3. Delete only the journal entries that are being replaced
    const cleanMaterials = Array.isArray(materials) ? materials : []
    const jeTypesToDelete: string[] = []
    if (cleanMaterials.length > 0) jeTypesToDelete.push("MATERIAL_ISSUE_TO_WIP")
    if (laborHours && laborCost) jeTypesToDelete.push("LABOR_APPLIED")
    if (overheadCost > 0) jeTypesToDelete.push("OVERHEAD_APPLIED")

    if (jeTypesToDelete.length > 0) {
      const { data: prevByRef } = await serviceDb
        .from(TABLES.JOURNAL_ENTRIES)
        .select("*")
        .eq("reference_doc", workOrderId)
        .in("type", jeTypesToDelete)
      
      const { data: prevByLink } = await serviceDb
        .from(TABLES.JOURNAL_ENTRIES)
        .select("*")
        .eq("linked_doc", workOrderId)
        .in("type", jeTypesToDelete)
      
      const entriesToVoid: any[] = []
      const uniqueIds = new Set<string>()
      
      if (prevByRef) {
        for (const doc of prevByRef) {
          if (!uniqueIds.has(doc.id)) {
            uniqueIds.add(doc.id)
            entriesToVoid.push(doc)
          }
        }
      }
      if (prevByLink) {
        for (const doc of prevByLink) {
          if (!uniqueIds.has(doc.id)) {
            uniqueIds.add(doc.id)
            entriesToVoid.push(doc)
          }
        }
      }

      for (const doc of entriesToVoid) {
        await JournalEntryService.voidJournalEntry(doc.id, "system")
      }

      const balanceAdjustments: Record<string, { debits: number; credits: number }> = {}
      
      for (const doc of entriesToVoid) {
        if (doc.entries && Array.isArray(doc.entries)) {
          for (const entry of doc.entries) {
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
        const { data: balDoc } = await serviceDb
          .from(TABLES.ACCOUNT_BALANCES)
          .select("*")
          .eq("id", accountCode)
          .single()
        
        if (balDoc) {
          const newTotalDebits = Math.max(0, (balDoc.totalDebits || 0) - adjustment.debits)
          const newTotalCredits = Math.max(0, (balDoc.totalCredits || 0) - adjustment.credits)
          
          const isDebit = isDebitNormalBalance(accountCode)
          const balance = isDebit
            ? newTotalDebits - newTotalCredits
            : newTotalCredits - newTotalDebits
          
          await serviceDb.from(TABLES.ACCOUNT_BALANCES).update({
            total_debits: newTotalDebits,
            total_credits: newTotalCredits,
            closing_balance: balance,
            updated_at: new Date().toISOString()
          }).eq("id", accountCode)
        }
      }
    }

    // 4. Process each new material usage
    const accountingMaterials: any[] = []

    for (const material of cleanMaterials) {
      if (!material.item_id || !material.qty) continue

      const { data: inventoryData } = await serviceDb
        .from(TABLES.INVENTORY_ITEMS)
        .select("*")
        .eq("sku", material.item_id)
        .limit(1)
        .single()
      
      const itemName = inventoryData ? (inventoryData.name || 'Unknown Item') : 'Unknown Item'
      
      if (inventoryData) {
        const currentQty = inventoryData.quantity_on_hand || 0
        const newQty = Math.max(0, currentQty - material.qty)
        const itemNameFromDoc = inventoryData.name || 'Unknown Item'
        
        await serviceDb.from(TABLES.INVENTORY_ITEMS).update({
          quantity_on_hand: newQty,
          last_updated: new Date().toISOString()
        }).eq("id", inventoryData.id)

        const movement = {
          item_id: material.item_id,
          item_name: itemNameFromDoc,
          movement_type: 'usage',
          quantity: -material.qty,
          unit_cost: material.cost || 0,
          total_cost: material.qty * (material.cost || 0),
          reason: 'Work Order Material Usage',
          reference: workOrderId,
          created_at: new Date().toISOString(),
          created_by: 'system'
        }
        
        await serviceDb.from(TABLES.INVENTORY_MOVEMENTS).insert(movement)
      }

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
    const finalOverheadCost = overheadCost !== undefined ? overheadCost : (workOrderData.overhead_cost || 0)
    const totalCost = totalMaterialCost + finalLaborCost + finalOverheadCost

    // 6. Update work order document with new costs
    const updatedWOData = {
      raw_materials_used: cleanMaterials,
      labor_hours: laborHours || 0,
      labor_cost: finalLaborCost,
      overhead_cost: finalOverheadCost,
      material_cost: totalMaterialCost,
      total_cost: totalCost,
      updated_at: new Date().toISOString()
    }

    await serviceDb.from(TABLES.WORK_ORDERS).update(updatedWOData).eq("id", workOrderId)

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
