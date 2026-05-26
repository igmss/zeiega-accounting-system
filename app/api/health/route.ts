import { NextRequest } from "next/server"
import { createSuccessResponse } from "@/lib/validation/helpers"
import { db, COLLECTIONS } from "@/lib/firebase"

/**
 * Health check endpoint for monitoring
 * Returns system status and basic metrics
 */
export async function GET(request: NextRequest) {
    let dbStatus = "disconnected"

    try {
        await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).limit(1).get()
        dbStatus = "connected"
    } catch {
        dbStatus = "disconnected"
    }

    const healthData = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        uptime: process.uptime(),
        checks: {
            database: dbStatus,
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + " MB",
            },
        },
    }

    return createSuccessResponse(healthData)
}
