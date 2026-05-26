import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission } from "@/lib/auth"

export async function POST() {
  try {
    const auth = await requirePermission("inventory:create")
    if (!auth.authorized) return auth.response

    console.log("Starting inventory balance sync...")

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

    console.log(`Calculated values - Raw: ${rawMaterialsValue}, WIP: ${wipValue}, Finished: ${finishedGoodsValue}`)

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
        console.log(`Updated ${accountUpdate.account_id} balance to ${accountUpdate.balance}`)
      } else {
        console.log(`Account ${accountUpdate.account_id} not found, skipping...`)
      }
    }

    // Create journal entry for balance adjustment
    const adjustmentEntry = {
      date: new Date(),
      entries: [
        { account_id: "INVENTORY_RAW", debit: rawMaterialsValue, credit: 0, description: "Inventory balance sync - Raw Materials" },
        { account_id: "INVENTORY_WIP", debit: wipValue, credit: 0, description: "Inventory balance sync - Work in Progress" },
        { account_id: "INVENTORY_FINISHED", debit: finishedGoodsValue, credit: 0, description: "Inventory balance sync - Finished Goods" }
      ],
      linked_doc: "inventory_sync",
      created_at: new Date()
    }

    await db.collection(COLLECTIONS.JOURNAL_ENTRIES).add(adjustmentEntry)

    return NextResponse.json({
      success: true,
      message: "Inventory balances synced successfully",
      balances: {
        rawMaterialsValue,
        wipValue,
        finishedGoodsValue,
        totalInventoryValue: rawMaterialsValue + wipValue + finishedGoodsValue
      }
    })

  } catch (error) {
    console.error("Error syncing inventory balances:", error)
    return NextResponse.json(
      { error: "Failed to sync inventory balances" },
      { status: 500 }
    )
  }
}
