import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/auth-helpers"
import { userStore, UserRole } from "@/lib/auth/user-model"

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response

  try {
    const users = await userStore.getAllUsers()
    return NextResponse.json({ success: true, data: users })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const { email, name, role, password } = body

    if (!email || !name || !role || !password) {
      return NextResponse.json(
        { error: "Email, name, role, and password are required" },
        { status: 400 }
      )
    }

    if (!Object.values(UserRole).includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${Object.values(UserRole).join(", ")}` },
        { status: 400 }
      )
    }

    const result = await userStore.createUser({ email, name, role, password })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to create user" }, { status: 400 })
    }

    return NextResponse.json({ success: true, userId: result.userId })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const { userId, isActive, role } = body

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    if (typeof isActive === "boolean" && !isActive) {
      const success = await userStore.deactivateUser(userId)
      if (!success) {
        return NextResponse.json({ error: "Failed to deactivate user" }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    if (role && !Object.values(UserRole).includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${Object.values(UserRole).join(", ")}` },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: "No valid update parameters provided" }, { status: 400 })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}
