import { NextResponse } from "next/server"
import { supabase, TABLES, getServiceClient } from "@/lib/supabase"
import { getAccountName } from "@/lib/accounting/account-types"
import { requirePermission, requireAuth } from "@/lib/auth"
import { EnhancedAccountingService, JournalEntryType, ACCOUNTS } from "@/lib/services/enhanced-accounting-service"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { amount, description, assetAccount, paymentMethod, useful_life_years, salvage_value, depreciation_method, date } = body

        if (!amount || amount <= 0) {
            return NextResponse.json({ error: "Valid asset cost amount is required" }, { status: 400 })
        }
        if (!assetAccount) {
            return NextResponse.json({ error: "Asset account is required" }, { status: 400 })
        }

        const assetDescription = description || `Asset acquisition - ${amount.toLocaleString()}`

        let paymentAccountCode = '1101'
        let paymentAccountName = 'Cash on Hand'
        if (paymentMethod === 'bank') {
            paymentAccountCode = '1103'
            paymentAccountName = 'Bank Account'
        } else if (paymentMethod === 'payable') {
            paymentAccountCode = '2101'
            paymentAccountName = 'Accounts Payable'
        } else if (paymentMethod === 'equity') {
            paymentAccountCode = body.partnerCode || '3011'
            paymentAccountName = getAccountName(paymentAccountCode)
        }

        const metadata: Record<string, any> = {}
        if (useful_life_years) {
            metadata.useful_life_years = Number(useful_life_years)
            metadata.salvage_value = Number(salvage_value || 0)
            metadata.depreciation_method = depreciation_method || 'straight-line'
        }

        const entryDate = date ? new Date(date) : new Date()

        const result = await EnhancedAccountingService.createJournalEntry(
            JournalEntryType.ASSET_PURCHASE,
            [
                {
                    accountCode: assetAccount,
                    accountName: getAccountName(assetAccount),
                    debit: amount,
                    credit: 0,
                    description: assetDescription,
                },
                {
                    accountCode: paymentAccountCode,
                    accountName: paymentAccountName,
                    debit: 0,
                    credit: amount,
                    description: `Payment for ${assetDescription}`,
                },
            ],
            `AST-${Date.now()}`,
            assetDescription,
            auth.user?.id,
            entryDate,
            undefined,
            metadata
        )

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: `Asset "${assetDescription}" recorded successfully`,
            journalEntryId: result.entryId,
            asset: { amount, description: assetDescription, assetAccount, paymentAccount: paymentAccountCode, date: entryDate.toISOString() }
        })
    } catch (error) {
        console.error("Error recording asset:", error)
        return NextResponse.json({ error: "Failed to record asset" }, { status: 500 })
    }
}

export async function GET() {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const { data: journalData, error: journalError } = await getServiceClient()
            .from(TABLES.JOURNAL_ENTRIES)
            .select(`*, ${TABLES.JOURNAL_ENTRY_LINES}(*)`)
            .order('date', { ascending: false })

        if (journalError) throw journalError

        const assetsMap: Record<string, any> = {}
        const depreciationMap: Record<string, number> = {}

        ;(journalData || []).forEach((entry: Record<string, any>) => {
            const lines = entry.journal_entry_lines || entry.lines || []

            const assetLine = lines.find((line: any) => {
                const code = line.account_code || line.accountCode || ""
                return (code.startsWith('13') || code.startsWith('14') || code.startsWith('15')) && (line.debit > 0)
            })

            if (entry.type === 'ASSET_PURCHASE' || (entry.type === 'MATERIAL_RECEIPT' && assetLine)) {
                const paymentLine = lines.find((line: any) => {
                    const code = line.account_code || line.accountCode || ""
                    return (line.credit > 0)
                })

                if (assetLine) {
                    const meta = (entry as any).metadata || {}
                    assetsMap[entry.id] = {
                        id: entry.id,
                        amount: assetLine.debit || 0,
                        description: entry.description || assetLine.description || '',
                        assetAccount: assetLine.account_code || '',
                        paymentAccount: paymentLine?.account_code || '',
                        date: entry.date || null,
                        useful_life_years: meta.useful_life_years || undefined,
                        salvage_value: meta.salvage_value || 0,
                        depreciation_method: meta.depreciation_method || 'straight-line',
                        created_at: entry.created_at || null,
                        accumulatedDepreciation: 0
                    }
                }
            }

            if (entry.type === 'DEPRECIATION' && entry.reference_id) {
                const refId = entry.reference_id as string
                if (refId.startsWith('DEP-')) {
                    const lastDash = refId.lastIndexOf('-')
                    const secondLastDash = refId.lastIndexOf('-', lastDash - 1)
                    if (secondLastDash > 4) {
                        const assetId = refId.slice(4, secondLastDash)
                        const depLine = lines.find((line: any) => {
                            const code = line.account_code || line.accountCode || ""
                            return code.startsWith('13') || code.startsWith('14')
                        })
                        if (depLine) {
                            const depAmount = depLine.credit || 0
                            depreciationMap[assetId] = (depreciationMap[assetId] || 0) + depAmount
                        }
                    }
                }
            }
        })

        const assetsList = Object.values(assetsMap).map((asset: any) => ({
            ...asset,
            accumulatedDepreciation: depreciationMap[asset.id] || 0,
            bookValue: asset.amount - (depreciationMap[asset.id] || 0)
        }))

        return NextResponse.json({ success: true, assets: assetsList, count: assetsList.length })
    } catch (error) {
        console.error("Error fetching assets:", error)
        return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 })
    }
}
