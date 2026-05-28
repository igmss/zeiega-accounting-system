import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { authOptions, hasPermission, UserRole } from "@/lib/auth"

function getBearerUser(): { id: string; email: string; name: string; role: UserRole } | null {
    try {
        const headersList = headers()
        const authHeader = headersList.get("authorization")
        if (!authHeader?.startsWith("Bearer ")) return null

        const bearerToken = authHeader.slice(7).trim()
        if (!bearerToken) return null

        const validTokens = new Set<string>()
        ;(process.env.API_SECRET || "").trim()      && validTokens.add(process.env.API_SECRET!.trim())
        ;(process.env.NEXTAUTH_SECRET || "").trim()  && validTokens.add(process.env.NEXTAUTH_SECRET!.trim())
        ;(process.env.API_ADMIN_TOKENS || "").split(",").forEach(t => { const v = t.trim(); if (v) validTokens.add(v) })
        ;(process.env.API_READ_TOKENS || "").split(",").forEach(t => { const v = t.trim(); if (v) validTokens.add(v) })

        if (validTokens.has(bearerToken)) {
            return {
                id: "api",
                email: "api@system",
                name: "API User",
                role: UserRole.ADMIN,
            }
        }
    } catch {}
    return null
}

/**
 * Get current session in API routes
 */
export async function getSession() {
    try {
        return await getServerSession(authOptions)
    } catch {
        return null
    }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
    const session = await getSession()
    return !!session?.user || !!getBearerUser()
}

/**
 * Get current user from session
 */
export async function getCurrentUser() {
    const session = await getSession()
    return session?.user || getBearerUser() || null
}

/**
 * Require authentication - returns error response if not authenticated
 */
export async function requireAuth(): Promise<
    | { authenticated: true; user: { id: string; email: string; name: string; role: UserRole } }
    | { authenticated: false; response: NextResponse }
> {
    const session = await getSession()

    if (session?.user) {
        return { authenticated: true, user: session.user }
    }

    const apiUser = getBearerUser()
    if (apiUser) {
        return { authenticated: true, user: apiUser }
    }

    return {
        authenticated: false,
        response: NextResponse.json(
            { success: false, error: "Authentication required" },
            { status: 401 }
        ),
    }
}

/**
 * Require specific permission - returns error response if not authorized
 */
export async function requirePermission(permission: string): Promise<
    | { authorized: true; user: { id: string; email: string; name: string; role: UserRole } }
    | { authorized: false; response: NextResponse }
> {
    const authResult = await requireAuth()

    if (!authResult.authenticated) {
        return { authorized: false, response: authResult.response }
    }

    const { user } = authResult

    if (!hasPermission(user.role, permission)) {
        return {
            authorized: false,
            response: NextResponse.json(
                { success: false, error: "Access denied. Insufficient permissions." },
                { status: 403 }
            ),
        }
    }

    return { authorized: true, user }
}

/**
 * Require admin role
 */
export async function requireAdmin(): Promise<
    | { authorized: true; user: { id: string; email: string; name: string; role: UserRole } }
    | { authorized: false; response: NextResponse }
> {
    const authResult = await requireAuth()

    if (!authResult.authenticated) {
        return { authorized: false, response: authResult.response }
    }

    if (authResult.user.role !== UserRole.ADMIN) {
        return {
            authorized: false,
            response: NextResponse.json(
                { success: false, error: "Admin access required" },
                { status: 403 }
            ),
        }
    }

    return { authorized: true, user: authResult.user }
}

/**
 * Create wrapper for protected API routes
 */
export function withAuth(
    handler: (
        request: NextRequest,
        context: { user: { id: string; email: string; name: string; role: UserRole } }
    ) => Promise<NextResponse>
) {
    return async (request: NextRequest) => {
        const authResult = await requireAuth()

        if (!authResult.authenticated) {
            return authResult.response
        }

        return handler(request, { user: authResult.user })
    }
}

/**
 * Create wrapper for permission-protected API routes
 */
export function withPermission(
    permission: string,
    handler: (
        request: NextRequest,
        context: { user: { id: string; email: string; name: string; role: UserRole } }
    ) => Promise<NextResponse>
) {
    return async (request: NextRequest) => {
        const authResult = await requirePermission(permission)

        if (!authResult.authorized) {
            return authResult.response
        }

        return handler(request, { user: authResult.user })
    }
}
