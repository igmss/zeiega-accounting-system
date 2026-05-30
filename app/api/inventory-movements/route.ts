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
        id: data.id,
        ...data,
        created_at: data.created_at || null,
        type: data.type || data.movement_type || "unknown",
        qty: data.qty ?? data.quantity ?? 0,
        related_doc: data.related_doc || data.reference || null,
        user: data.user || data.created_by || null,
        item_id: data.item_id || data.sku || null,
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

    // Add timestamps
    const now = new Date().toISOString()
    const movement = {
      ...movementData,
      createdAt: now,
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
