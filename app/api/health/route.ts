import { NextRequest } from "next/server"
import { createSuccessResponse } from "@/lib/validation/helpers"

/**
 * Health check endpoint for monitoring
 * Returns system status and basic metrics
 */
export async function GET(request: NextRequest) {
    const healthData = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        uptime: process.uptime(),
        checks: {
            database: "connected", // TODO: Add actual database ping
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + " MB",
            },
        },
    }

    return createSuccessResponse(healthData)
}
