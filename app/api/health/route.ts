import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"

export async function GET() {
    let dbStatus = "ok"

    try {
        const { error } = await getServiceClient()
            .from(TABLES.CHART_OF_ACCOUNTS)
            .select("id")
            .limit(1)

        if (error) {
            dbStatus = "degraded"
        }
    } catch {
        dbStatus = "degraded"
    }

    return NextResponse.json({ status: dbStatus })
}
