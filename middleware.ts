import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

function generateNonce(): string {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
}

// Get allowed origins from environment variable
const getAllowedOrigins = (): string[] => {
    const origins = process.env.ALLOWED_ORIGINS || ""
    const list = origins.split(",").map((o) => o.trim()).filter(Boolean)
    // In development, allow localhost
    if (process.env.NODE_ENV === "development") {
        list.push("http://localhost:3000", "http://localhost:3001")
    }
    return list
}

// Paths that require authentication
const PROTECTED_PATHS = [
    "/api/customers",
    "/api/inventory",
    "/api/designs",
    "/api/sales-orders",
    "/api/work-orders",
    "/api/invoices",
    "/api/payments",
    "/api/reports",
    "/api/journal-entries",
    "/api/dashboard",
    "/api/bom",
    "/api/vendors",
    "/api/purchase-orders",
    "/api/accounting",
    "/api/chart-of-accounts",
    "/api/contracts",
    "/api/fiscal",
    "/api/inventory-movements",
    "/api/loans",
    "/api/overhead",
    "/api/variance",
    "/api/workflow",
    "/api/real-orders",
]

// Paths that are public (no auth required)
const PUBLIC_PATHS = [
    "/api/webhooks",   // Webhooks have their own auth via secret
    "/api/health",     // Health check endpoints
    "/api/auth",       // Auth endpoints themselves
    "/auth",           // Auth pages
    "/_next",
    "/favicon.ico",
]

// Initialize Redis and Rate Limiter
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
})

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(100, "60 s"),
  analytics: true,
})

/**
 * Check if a path should be protected
 */
function isProtectedPath(pathname: string): boolean {
    // Check if it's a public path
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return false
    }

    // Check if it's a protected API path
    return PROTECTED_PATHS.some((p) => pathname.startsWith(p))
}

/**
 * Check if path is a protected page (not API)
 */
function isProtectedPage(pathname: string): boolean {
    // Dashboard and module pages require auth
    const protectedPages = [
        "/customers",
        "/inventory",
        "/designs",
        "/sales-orders",
        "/work-orders",
        "/invoices",
        "/payments",
        "/reports",
        "/chart-of-accounts",
        "/background-jobs",
        "/expenses",
        "/assets",
        "/liabilities",
        "/accounting/setup/opening-balances",
        "/journal-entries",
    ]
    return pathname === "/" || protectedPages.some((p) => pathname.startsWith(p))
}

/**
 * Check rate limiting using Redis
 */
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; reset: number; redisAvailable: boolean }> {
    if (!process.env.UPSTASH_REDIS_REST_URL) {
        return { allowed: false, remaining: 0, reset: 0, redisAvailable: false }
    }
    try {
        const { success, remaining, reset } = await ratelimit.limit(ip)
        return { allowed: success, remaining, reset, redisAvailable: true }
    } catch {
        return { allowed: false, remaining: 0, reset: 0, redisAvailable: false }
    }
}

/**
 * Get client IP address
 */
function getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for")
    const ip = forwarded?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown"
    return ip
}

/**
 * Apply CORS headers
 */
function applyCORSHeaders(response: NextResponse, origin: string | null): NextResponse {
    const allowedOrigins = getAllowedOrigins()

    // If origin is in allowed list, set CORS headers
    if (origin && allowedOrigins.includes(origin)) {
        response.headers.set("Access-Control-Allow-Origin", origin)
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.set("Access-Control-Allow-Credentials", "true")
    }

    return response
}

/**
 * Apply security headers
 */
function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
    response.headers.set("X-Frame-Options", "DENY")
    response.headers.set("X-Content-Type-Options", "nosniff")
    response.headers.set("X-XSS-Protection", "1; mode=block")
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    const scriptSrc = process.env.NODE_ENV === "development"
        ? `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
        : `'self' 'nonce-${nonce}' 'unsafe-inline'`

    response.headers.set(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            `script-src ${scriptSrc}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
        ].join("; ")
    )

    return response
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const origin = request.headers.get("origin")
    const ip = getClientIP(request)
    const nonce = generateNonce()

    // Handle preflight requests
    if (request.method === "OPTIONS") {
        const response = new NextResponse(null, { status: 204 })
        return applyCORSHeaders(response, origin)
    }

    let rateLimitInfo: { remaining: number; reset: number } | null = null

    // Apply rate limiting to API routes
    if (pathname.startsWith("/api/")) {
        const rateLimit = await checkRateLimit(ip)

        if (!rateLimit.redisAvailable) {
            const response = NextResponse.json(
                { success: false, error: "Service temporarily unavailable" },
                { status: 503 }
            )
            response.headers.set("Retry-After", "30")
            response.headers.set("X-RateLimit-Warning", "Redis unavailable")
            return response
        }

        rateLimitInfo = { remaining: rateLimit.remaining, reset: rateLimit.reset }

        if (!rateLimit.allowed) {
            const response = NextResponse.json(
                { success: false, error: "Too many requests. Please try again later." },
                { status: 429 }
            )
            response.headers.set("Retry-After", "60")
            response.headers.set("X-RateLimit-Limit", "100")
            response.headers.set("X-RateLimit-Remaining", "0")
            response.headers.set("X-RateLimit-Reset", String(rateLimit.reset))
            return response
        }
    }

    // Verify JWT using dedicated middleware secret (falls back to NEXTAUTH_SECRET for compat)
    const token = await getToken({
        req: request,
        secret: process.env.MIDDLEWARE_SECRET || process.env.NEXTAUTH_SECRET
    })

    // Handle protected pages - redirect to login if not authenticated
    if (isProtectedPage(pathname) && !token) {
        const loginUrl = new URL("/auth/login", request.url)
        loginUrl.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(loginUrl)
    }

    // Handle protected API routes - return 401 if not authenticated
    if (isProtectedPath(pathname) && !token) {
        return NextResponse.json(
            { success: false, error: "Authentication required" },
            { status: 401 }
        )
    }

    // Propagate nonce to server components via request header
    request.headers.set("x-csp-nonce", nonce)

    // Continue with the request
    const response = NextResponse.next()

    // Apply headers
    applyCORSHeaders(response, origin)
    applySecurityHeaders(response, nonce)

    // Apply rate limit info headers to API responses
    if (rateLimitInfo) {
        response.headers.set("X-RateLimit-Limit", "100")
        response.headers.set("X-RateLimit-Remaining", String(rateLimitInfo.remaining))
        response.headers.set("X-RateLimit-Reset", String(rateLimitInfo.reset))
    }

    // Expose nonce to client for inline scripts
    response.headers.set("X-CSP-Nonce", nonce)

    return response
}

// Configure middleware to run on specific routes
export const config = {
    matcher: [
        // Match all paths except static files
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
}
