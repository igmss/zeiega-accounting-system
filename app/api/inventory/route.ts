import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"
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


export async function GET() {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const inventorySnapshot = await db.collection(COLLECTIONS.INVENTORY_ITEMS).get()
    const inventoryItems = inventorySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    return NextResponse.json(inventoryItems)
  } catch (error) {
    console.error("Error fetching inventory items:", error)
    return NextResponse.json(
      { error: "Failed to fetch inventory items" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("inventory:create")
  if (!auth.authorized) return auth.response
  try {
    const itemData = await request.json()
    const { paymentSource, ...itemDataWithoutSource } = itemData
    
    // Add timestamps
    const now = new Date()
    const item = {
      ...itemDataWithoutSource,
      createdAt: now,
      updatedAt: now,
      lastUpdated: now,
    }

    // Validate payment source
    const paymentSourceMap: Record<string, { id: string, name: string }> = {
      cash: { id: "1101", name: "Cash on Hand" },
      bank: { id: "1103", name: "Bank Account" },
      payable: { id: "2101", name: "Accounts Payable" },
      opening: { id: "3100", name: "Retained Earnings" },
    }

    if (!paymentSource || !paymentSourceMap[paymentSource]) {
      return NextResponse.json(
        { error: "Valid payment source is required (cash, bank, payable, opening)" },
        { status: 400 }
      )
    }

    const creditAccount = paymentSourceMap[paymentSource]
    
    // Calculate total cost
    const totalCost = (item.quantity_on_hand || 0) * (item.cost_per_unit || 0)
    
    // Add inventory item
    const docRef = await db.collection(COLLECTIONS.INVENTORY_ITEMS).add(item)
    
    // Create journal entry for inventory purchase
    if (totalCost > 0) {
      const inventoryAccount = item.type === "finished" ? "1220" : "1201"
      const inventoryAccountName = item.type === "finished" ? "Finished Goods" : "Raw Materials - Fabric"
        const journalEntry = {
          id: `INV-OP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          date: now,
          type: "OPENING_BALANCE",
          description: `Inventory: ${item.name} - ${item.quantity_on_hand} ${item.unit}`,
          entries: [
            {
              account_id: inventoryAccount,
              account_name: inventoryAccountName,
              debit: totalCost,
              credit: 0,
              description: `Inventory: ${item.name} - ${item.quantity_on_hand} ${item.unit}`
            },
            {
              account_id: creditAccount.id,
              account_name: creditAccount.name,
              debit: 0,
              credit: totalCost,
              description: `${creditAccount.name} for inventory: ${item.name}`
            }
          ],
          account_ids: [inventoryAccount, creditAccount.id],
          total_debits: totalCost,
          total_credits: totalCost,
          reference_doc: docRef.id,
          status: "posted",
          created_at: now,
          created_by: "system"
        }
        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(journalEntry.id).set(journalEntry)
        
        // Sync affected account balances
        await CentralizedAccountingService.syncMultipleAccountBalances([inventoryAccount, creditAccount.id])
        
        console.log(`Created journal entry for inventory purchase sync: EGP ${totalCost} via ${creditAccount.name}`)
    }
    
    
    return NextResponse.json({ id: docRef.id, ...item })
  } catch (error) {
    console.error("Error creating inventory item:", error)
    return NextResponse.json(
      { error: "Failed to create inventory item" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission("inventory:create")
  if (!auth.authorized) return auth.response
  try {
    const { id, ...itemData } = await request.json()
    
    const item = {
      ...itemData,
      updatedAt: new Date(),
      lastUpdated: new Date(),
    }
    
    await db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(id).update(item)
    
    
    return NextResponse.json({ id, ...item })
  } catch (error) {
    console.error("Error updating inventory item:", error)
    return NextResponse.json(
      { error: "Failed to update inventory item" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const auth = await requirePermission("inventory:create")
  if (!auth.authorized) return auth.response
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      )
    }
    
    await db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(id).delete()
    
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting inventory item:", error)
    return NextResponse.json(
      { error: "Failed to delete inventory item" },
      { status: 500 }
    )
  }
}
