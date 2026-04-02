import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions, hasPermission, UserRole } from "@/lib/auth"

/**
 * Get current session in API routes
 */
export async function getSession() {
    return getServerSession(authOptions)
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
    const session = await getSession()
    return !!session?.user
}

/**
 * Get current user from session
 */
export async function getCurrentUser() {
    const session = await getSession()
    return session?.user || null
}

/**
 * Require authentication - returns error response if not authenticated
 */
export async function requireAuth(): Promise<
    | { authenticated: true; user: { id: string; email: string; name: string; role: UserRole } }
    | { authenticated: false; response: NextResponse }
> {
    const session = await getSession()

    if (!session?.user) {
        return {
            authenticated: false,
            response: NextResponse.json(
                { success: false, error: "Authentication required" },
                { status: 401 }
            ),
        }
    }

    return {
        authenticated: true,
        user: session.user,
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
