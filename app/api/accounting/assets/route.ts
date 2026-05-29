import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { getAccountName } from "@/lib/accounting/account-types"
import { requirePermission, requireAuth } from "@/lib/auth"
import { CentralizedAccountingService } from "@/lib/services/centralized-accounting-service"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { amount, description, assetAccount, paymentMethod, useful_life_years, salvage_value, depreciation_method } = body

        // Validate input
        if (!amount || amount <= 0) {
            return NextResponse.json(
                { error: "Valid asset cost amount is required" },
                { status: 400 }
            )
        }

        if (!assetAccount) {
            return NextResponse.json(
                { error: "Asset account is required" },
                { status: 400 }
            )
        }

        const now = new Date()
        const assetDescription = description || `Asset acquisition - ${amount.toLocaleString()}`

        // Map payment method to actual COA codes
        let paymentAccountCode = '1101' // Default Cash on Hand
        let paymentAccountName = 'Cash on Hand'

        if (paymentMethod === 'bank') {
            paymentAccountCode = '1103' // Main Bank
            paymentAccountName = 'Bank Account'
        } else if (paymentMethod === 'payable') {
            paymentAccountCode = '2101' // Accounts Payable
            paymentAccountName = 'Accounts Payable'
        } else if (paymentMethod === 'equity') {
            const partnerCode = body.partnerCode || '3011' // Default to Ahmed if not specified
            paymentAccountCode = partnerCode
            paymentAccountName = getAccountName(partnerCode)
        }

        // Create journal entry document directly
        // Mirrors Expenses structure
        const entryId = `AST-${Date.now()}`

        const journalEntry = {
            id: entryId,
            date: now,
            description: assetDescription,
            reference: `AST-${Math.floor(Math.random() * 10000)}`,
            type: 'ASSET_PURCHASE', // Specific type for assets
            metadata: {
                useful_life_years: useful_life_years || null,
                salvage_value: salvage_value || 0,
                depreciation_method: depreciation_method || (useful_life_years ? 'straight_line' : null)
            },
            entries: [
                {
                    account_id: assetAccount, // e.g. "1501" - Machinery
                    description: assetDescription,
                    debit: amount,
                    credit: 0
                },
                {
                    account_id: paymentAccountCode, // e.g. "1101"
                    description: `Payment for ${assetDescription}`,
                    debit: 0,
                    credit: amount
                }
            ],
            account_ids: [assetAccount, paymentAccountCode], // BUG-1.2 Fix
            total_debits: amount,
            total_credits: amount,
            created_at: now,
            status: 'posted'
        }

        // Save to Firestore
        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

        // Sync affected account balances so COA reflects immediately
        await CentralizedAccountingService.syncMultipleAccountBalances([assetAccount, paymentAccountCode])

        return NextResponse.json({
            success: true,
            message: `Asset "${assetDescription}" recorded successfully`,
            journalEntryId: entryId,
            asset: {
                amount: amount,
                description: assetDescription,
                assetAccount: assetAccount,
                paymentAccount: paymentAccountCode,
                date: now
            }
        })

    } catch (error) {
        console.error("Error recording asset:", error)
        return NextResponse.json(
            { error: "Failed to record asset" },
            { status: 500 }
        )
    }
}

export async function GET() {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        // Fetch journal entries relevant to assets
        const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
            .orderBy('date', 'desc')
            .get()

        const assetsMap: Record<string, any> = {}
        const depreciationMap: Record<string, number> = {}

        journalSnapshot.docs.forEach(doc => {
            const entry = doc.data()
            const entries = entry.entries || entry.lines || []

            // Identify asset purchase
            const assetLine = entries.find((line: any) => {
                const code = line.account_id || line.accountCode || ""
                return (code.startsWith('13') || code.startsWith('14') || code.startsWith('15')) && (line.debit > 0)
            })

            if (assetLine && entry.type === 'ASSET_PURCHASE') {
                const paymentLine = entries.find((line: any) => {
                    const code = line.account_id || line.accountCode || ""
                    return (code.startsWith('1') || code.startsWith('2') || code.startsWith('3')) && (line.credit > 0)
                })

                assetsMap[doc.id] = {
                    id: doc.id,
                    amount: assetLine.debit || 0,
                    description: entry.description || entry.memo || assetLine.description || '',
                    assetAccount: assetLine.account_id || assetLine.accountCode || '',
                    paymentAccount: paymentLine?.account_id || paymentLine?.accountCode || '',
                    date: entry.date?.toDate ? entry.date.toDate() : (entry.date || new Date()),
                    useful_life_years: entry.metadata?.useful_life_years,
                    salvage_value: entry.metadata?.salvage_value,
                    depreciation_method: entry.metadata?.depreciation_method,
                    created_at: entry.created_at?.toDate ? entry.created_at.toDate() : (entry.created_at || new Date()),
                    accumulatedDepreciation: 0
                }
            }

            // Identify depreciation entries
            if (entry.type === 'DEPRECIATION' && entry.reference_doc?.startsWith('DEP-')) {
                // reference_doc format: DEP-{assetEntryId}-{year}-{month}
                const parts = entry.reference_doc.split('-')
                if (parts.length >= 2) {
                    const assetId = parts.slice(1, -2).join('-') // Reconstruct assetEntryId
                    const depAmount = entries.find((line: any) => line.credit > 0)?.credit || 0
                    depreciationMap[assetId] = (depreciationMap[assetId] || 0) + depAmount
                }
            }
        })

        // Merge depreciation into assets
        const assetsList = Object.values(assetsMap).map(asset => ({
            ...asset,
            accumulatedDepreciation: depreciationMap[asset.id] || 0,
            bookValue: asset.amount - (depreciationMap[asset.id] || 0)
        }))

        return NextResponse.json({
            success: true,
            assets: assetsList,
            count: assetsList.length,
            timestamp: new Date().toISOString()
        })

    } catch (error) {
        console.error("Error fetching assets:", error)
        return NextResponse.json(
            { error: "Failed to fetch assets" },
            { status: 500 }
        )
    }
}
