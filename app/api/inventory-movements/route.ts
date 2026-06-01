import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { requireAuth, requirePermission } from "@/lib/auth"

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const { data: movementsData, error } = await getServiceClient()
      .from(TABLES.INVENTORY_MOVEMENTS)
      .select("*")

    if (error) throw error

    const movements = (movementsData || []).map((data: Record<string, any>) => {
      return {
        ...data,
        item_name: data.item_name || `Item ${data.item_id || data.sku || 'unknown'}`,
      }
    })

    return NextResponse.json(movements)
  } catch (error) {
    console.error("Error fetching inventory movements:", error)
    return NextResponse.json(
      { error: "Failed to fetch inventory movements" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("inventory:create")
    if (!auth.authorized) return auth.response

    const movementData = await request.json()

    const now = new Date().toISOString()
    const movement = {
      item_id: movementData.item_id || movementData.itemId,
      sku: movementData.sku || movementData.item_id || null,
      qty: movementData.qty ?? movementData.quantity ?? 0,
      type: movementData.type || movementData.movement_type || 'adjustment',
      related_doc: movementData.related_doc || movementData.reference || null,
      notes: movementData.notes || movementData.reason || null,
      created_at: now,
    }

    const { data: created, error } = await getServiceClient()
      .from(TABLES.INVENTORY_MOVEMENTS)
      .insert(movement)
      .select()

    if (error || !created || created.length === 0) throw error || new Error("Failed to create movement")

    return NextResponse.json(created[0])
  } catch (error) {
    console.error("Error creating inventory movement:", error)
    return NextResponse.json(
      { error: "Failed to create inventory movement" },
      { status: 500 }
    )
  }
}
