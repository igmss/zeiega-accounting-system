import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const movementsSnapshot = await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS).get()
    const movements = movementsSnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        // Normalize dates: convert Firestore Timestamps to ISO strings
        created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at || null,
        // Normalize field name aliases
        type: data.type || data.movement_type || "unknown",
        qty: data.qty ?? data.quantity ?? 0,
        related_doc: data.related_doc || data.reference || null,
        user: data.user || data.created_by || "system",
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
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const movementData = await request.json()
    
    // Add timestamps
    const now = new Date()
    const movement = {
      ...movementData,
      createdAt: now,
      created_at: now,
    }
    
    const docRef = await db.collection(COLLECTIONS.INVENTORY_MOVEMENTS).add(movement)
    
    return NextResponse.json({ id: docRef.id, ...movement })
  } catch (error) {
    console.error("Error creating inventory movement:", error)
    return NextResponse.json(
      { error: "Failed to create inventory movement" },
      { status: 500 }
    )
  }
}
