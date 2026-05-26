import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { FieldValue } from "firebase-admin/firestore"
import { requirePermission } from "@/lib/auth"

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
    
    // Get work order
    const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get()
    if (!workOrderDoc.exists) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 }
      )
    }
    
    const workOrder = workOrderDoc.data()
    
    // Calculate total material cost
    const totalMaterialCost = materials.reduce((sum, material) => {
      return sum + (material.qty * material.cost)
    }, 0)
    
    // Update work order with issued materials
    await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update({
      raw_materials_used: materials,
      status: "in_progress",
      updated_at: new Date()
    })
    
    // Create journal entry for materials usage
    const journalEntry = {
      date: new Date(),
      entries: [
        {
          account_id: "INVENTORY_WIP",
          debit: totalMaterialCost,
          credit: 0,
          description: `Materials issued for work order ${workOrderId}`
        },
        {
          account_id: "INVENTORY_RAW",
          debit: 0,
          credit: totalMaterialCost,
          description: `Materials issued for work order ${workOrderId}`
        }
      ],
      linked_doc: workOrderId,
      created_at: new Date()
    }
    
    await db.collection(COLLECTIONS.JOURNAL_ENTRIES).add(journalEntry)
    
    // Update inventory quantities
    for (const material of materials) {
      const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(material.item_id)
      await inventoryRef.update({
        quantity_on_hand: FieldValue.increment(-material.qty),
        last_updated: new Date()
      })
    }
    
    // Update Chart of Accounts balances
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

// Helper function to sync inventory with chart of accounts
async function syncInventoryWithChartOfAccounts() {
  try {
    // Fetch all inventory items
    const inventorySnapshot = await db.collection(COLLECTIONS.INVENTORY_ITEMS).get()
    const inventoryItems: any[] = inventorySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Calculate totals by type
    const rawMaterialsValue = inventoryItems
      .filter(item => item.type === 'raw')
      .reduce((sum, item) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    const finishedGoodsValue = inventoryItems
      .filter(item => item.type === 'finished')
      .reduce((sum, item) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    const wipValue = inventoryItems
      .filter(item => item.type === 'wip')
      .reduce((sum, item) => sum + ((item.quantity_on_hand || 0) * (item.cost_per_unit || 0)), 0)

    // Update chart of accounts balances
    const accountsToUpdate = [
      { account_id: "INVENTORY_RAW", balance: rawMaterialsValue },
      { account_id: "INVENTORY_WIP", balance: wipValue },
      { account_id: "INVENTORY_FINISHED", balance: finishedGoodsValue }
    ]

    for (const accountUpdate of accountsToUpdate) {
      const accountRef = db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).doc(accountUpdate.account_id)
      const accountDoc = await accountRef.get()
      
      if (accountDoc.exists) {
        await accountRef.update({
          balance: accountUpdate.balance,
          last_updated: new Date()
        })
      }
    }

    console.log(`Updated inventory balances - Raw: ${rawMaterialsValue}, WIP: ${wipValue}, Finished: ${finishedGoodsValue}`)
  } catch (error) {
    console.error("Error syncing inventory with chart of accounts:", error)
  }
}
