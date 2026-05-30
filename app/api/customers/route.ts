import { NextResponse } from "next/server"
import { getServiceClient, TABLES } from "@/lib/supabase"
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const cursor = searchParams.get("cursor")

    let query = getServiceClient()
      .from(TABLES.CUSTOMERS)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (cursor) {
      const { data: cursorDoc } = await getServiceClient()
        .from(TABLES.CUSTOMERS)
        .select("created_at")
        .eq("id", cursor)
        .single()

      if (cursorDoc) {
        query = query.lt("created_at", (cursorDoc as any).created_at)
      }
    }

    const { data: customers, error } = await query

    if (error) throw error

    const arr = (customers || []) as any[]
    const lastVisible = arr.length > 0 ? arr[arr.length - 1] : null
    const nextCursor = lastVisible ? lastVisible.id : null
    const hasMore = arr.length === limit

    return NextResponse.json({
      data: arr,
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

    const { data, error } = await (getServiceClient()
      .from(TABLES.CUSTOMERS)
      .insert({
        name: customerData.name,
        email: customerData.email,
        phone: customerData.phone || "",
        address: customerData.address || "",
      } as any)
      .select()
      .single())

    if (error) throw error

    return NextResponse.json(data)
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

    const { error } = await getServiceClient()
      .from(TABLES.CUSTOMERS)
      .update({
        name: customerData.name,
        email: customerData.email,
        phone: customerData.phone,
        address: customerData.address,
      })
      .eq("id", id)

    if (error) throw error

    return NextResponse.json({ id, ...customerData })
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
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      )
    }

    const { error } = await getServiceClient()
      .from(TABLES.CUSTOMERS)
      .delete()
      .eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting customer:", error)
    return NextResponse.json(
      { error: "Failed to delete customer" },
      { status: 500 }
    )
  }
}
