import { NextRequest, NextResponse } from "next/server"

export function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || ""
  const list = origins.split(",").map((o) => o.trim()).filter(Boolean)

  if (process.env.NODE_ENV === "development") {
    list.push("http://localhost:3000", "http://localhost:3001")
  }
  return list
}

export function getCORSHeaders(
  request: NextRequest,
  extraHeaders: string[] = []
): Record<string, string> {
  const origin = request.headers.get("origin") || ""
  const allowedOrigins = getAllowedOrigins()

  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": ["Content-Type", "Authorization", ...extraHeaders].join(", "),
    }
  }

  return {}
}

export function handlePreflight(request: NextRequest, extraHeaders: string[] = []): NextResponse | null {
  if (request.method !== "OPTIONS") return null

  const corsHeaders = getCORSHeaders(request, extraHeaders)
  if (Object.keys(corsHeaders).length === 0) {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, { status: 200, headers: corsHeaders })
}
