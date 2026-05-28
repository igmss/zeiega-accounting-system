import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { requirePermission } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    try {
        const auth = await requirePermission("reports:view")
        if (!auth.authorized) return auth.response

        const { searchParams } = new URL(request.url)
        const toDate = searchParams.get("to") || new Date().toISOString().split("T")[0]
        const today = new Date(toDate)

        // Query invoices/receivables
        const invoicesRef = db.collection(COLLECTIONS.INVOICES)
        const invoicesSnapshot = await invoicesRef.get()

        // Initialize aging buckets
        const customers: { [key: string]: any } = {}
        let totalCurrent = 0
        let total31_60 = 0
        let total61_90 = 0
        let totalOver90 = 0

        invoicesSnapshot.docs.forEach((doc) => {
            const invoice = doc.data()
            if (invoice.status === "paid") return // Skip paid invoices

            const dueDateVal = invoice.due_date || invoice.dueDate || invoice.date
            const dueDate = dueDateVal?.toDate ? dueDateVal.toDate() : new Date(dueDateVal)
            const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
            const amount = invoice.total_amount || invoice.amount || invoice.balance || invoice.total || 0
            const customerName = invoice.customer_name || invoice.customerName || invoice.customer || "Unknown Customer"

            if (!customers[customerName]) {
                customers[customerName] = {
                    name: customerName,
                    current: 0,
                    days_31_60: 0,
                    days_61_90: 0,
                    over_90: 0,
                    total: 0
                }
            }

            if (daysPastDue <= 30) {
                customers[customerName].current += amount
                totalCurrent += amount
            } else if (daysPastDue <= 60) {
                customers[customerName].days_31_60 += amount
                total31_60 += amount
            } else if (daysPastDue <= 90) {
                customers[customerName].days_61_90 += amount
                total61_90 += amount
            } else {
                customers[customerName].over_90 += amount
                totalOver90 += amount
            }

            customers[customerName].total += amount
        })

        // If no invoice data, get AR from journal entries
        if (Object.keys(customers).length === 0) {
            const journalEntriesRef = db.collection(COLLECTIONS.JOURNAL_ENTRIES)
            const journalSnapshot = await journalEntriesRef.get()

            let arBalance = 0
            journalSnapshot.docs.forEach((doc) => {
                const entry = doc.data()
                const lines = entry.entries || entry.lines || []
                lines.forEach((line: any) => {
                    const accountCode = line.account_id || line.accountCode || ""
                    if (accountCode === "1110") {
                        arBalance += (line.debit || 0) - (line.credit || 0)
                    }
                })
            })

            if (arBalance > 0) {
                customers["General Receivables"] = {
                    name: "General Receivables",
                    current: arBalance,
                    days_31_60: 0,
                    days_61_90: 0,
                    over_90: 0,
                    total: arBalance
                }
                totalCurrent = arBalance
            }
        }

        const customerList = Object.values(customers).sort((a, b) => b.total - a.total)

        return NextResponse.json({
            as_of_date: toDate,
            summary: {
                current: totalCurrent,
                days_31_60: total31_60,
                days_61_90: total61_90,
                over_90: totalOver90,
                total: totalCurrent + total31_60 + total61_90 + totalOver90
            },
            customers: customerList
        })
    } catch (error) {
        console.error("AR Aging report error:", error)
        return NextResponse.json(
            { error: "Failed to generate AR aging report" },
            { status: 500 }
        )
    }
}
