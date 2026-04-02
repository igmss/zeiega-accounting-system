import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

export async function POST(request: Request) {
  try {
    const { workOrderId } = await request.json()
    
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Work order ID is required" },
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
    
    const workOrder = workOrderDoc.data() as any
    
    // Update work order status
    await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update({
      status: "completed",
      completionPercentage: 100,
      completed_at: new Date(),
      updated_at: new Date()
    })
    
    const { WorkOrderMaterialService } = await import("@/lib/services/work-order-material-service")

    const result = await WorkOrderMaterialService.completeWorkOrder(
      workOrderId,
      workOrder.design_id || ""
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    
    return NextResponse.json({
      success: true,
      message: "Work order completed successfully",
      workOrderId,
      totalValue: workOrder.total_amount || 0
    })
    
  } catch (error) {
    console.error("Error completing work order:", error)
    return NextResponse.json(
      { error: "Failed to complete work order" },
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
