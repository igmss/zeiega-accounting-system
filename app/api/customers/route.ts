import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    let query = db.collection(COLLECTIONS.CUSTOMERS)
      .orderBy("createdAt", "desc")
      .limit(limit)
    
    if (cursor) {
      const lastDoc = await db.collection(COLLECTIONS.CUSTOMERS).doc(cursor).get()
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc)
      }
    }

    const customersSnapshot = await query.get()
    const customers = customersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    const lastVisible = customersSnapshot.docs[customersSnapshot.docs.length - 1]
    const nextCursor = lastVisible ? lastVisible.id : null
    const hasMore = customersSnapshot.docs.length === limit

    return NextResponse.json({
      data: customers,
      nextCursor,
      hasMore
    })
  } catch (error) {
    console.error("Error fetching customers:", error)
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("customers:create")
  if (!auth.authorized) return auth.response
  try {
    const customerData = await request.json()
    
    // Add timestamps
    const now = new Date()
    const customer = {
      ...customerData,
      createdAt: now,
      updatedAt: now,
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: null,
    }
    
    const docRef = await db.collection(COLLECTIONS.CUSTOMERS).add(customer)
    
    return NextResponse.json({ id: docRef.id, ...customer })
  } catch (error) {
    console.error("Error creating customer:", error)
    return NextResponse.json(
      { error: "Failed to create customer" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission("customers:create")
  if (!auth.authorized) return auth.response
  try {
    const { id, ...customerData } = await request.json()
    
    const customer = {
      ...customerData,
      updatedAt: new Date(),
    }
    
    await db.collection(COLLECTIONS.CUSTOMERS).doc(id).update(customer)
    
    return NextResponse.json({ id, ...customer })
  } catch (error) {
    console.error("Error updating customer:", error)
    return NextResponse.json(
      { error: "Failed to update customer" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const auth = await requirePermission("customers:create")
  if (!auth.authorized) return auth.response
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      )
    }
    
    await db.collection(COLLECTIONS.CUSTOMERS).doc(id).delete()
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting customer:", error)
    return NextResponse.json(
      { error: "Failed to delete customer" },
      { status: 500 }
    )
  }
}
