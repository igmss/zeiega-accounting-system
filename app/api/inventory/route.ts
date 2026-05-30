import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service"

export async function GET() {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { data: inventoryItems, error } = await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .select("*")

    if (error) throw error

    return NextResponse.json(inventoryItems || [])
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
    const now = new Date().toISOString()
    const item = {
      ...itemDataWithoutSource,
      created_at: now,
      updated_at: now,
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
    const { data: created, error: insertError } = await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .insert(item)
      .select()

    if (insertError || !created || created.length === 0) {
      throw insertError || new Error("Failed to create inventory item")
    }

    const newItem = created[0]

    // Create journal entry for inventory purchase
    if (totalCost > 0) {
      const inventoryAccount = item.type === "finished" ? "1220" : "1201"
      const inventoryAccountName = item.type === "finished" ? "Finished Goods" : "Raw Materials - Fabric"

      const result = await EnhancedAccountingService.createJournalEntry(
        JournalEntryType.GENERAL,
        [
          {
            accountCode: inventoryAccount,
            accountName: inventoryAccountName,
            debit: totalCost,
            credit: 0,
            description: `Inventory: ${item.name} - ${item.quantity_on_hand} ${item.unit}`,
          },
          {
            accountCode: creditAccount.id,
            accountName: creditAccount.name,
            debit: 0,
            credit: totalCost,
            description: `${creditAccount.name} for inventory: ${item.name}`,
          },
        ],
        newItem.id,
        `Inventory: ${item.name} - ${item.quantity_on_hand} ${item.unit}`,
        auth.user?.id
      )

      if (result.success) {
        console.log(`Created journal entry for inventory purchase sync: EGP ${totalCost} via ${creditAccount.name}`)
      }
    }


    return NextResponse.json(newItem)
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
      updatedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    }

    await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .update(item)
      .eq("id", id)


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

    await getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .delete()
      .eq("id", id)


    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting inventory item:", error)
    return NextResponse.json(
      { error: "Failed to delete inventory item" },
      { status: 500 }
    )
  }
}
