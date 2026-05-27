import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

export async function GET() {
    let dbStatus = "ok"

    try {
        await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).limit(1).get()
    } catch {
        dbStatus = "degraded"
    }

    return NextResponse.json({ status: dbStatus })
}
