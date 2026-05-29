import { NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"
import { getAccountName } from "@/lib/accounting/account-types"
import { requirePermission } from "@/lib/auth"
import { CentralizedAccountingService } from "@/lib/services/centralized-accounting-service"

export async function POST(request: Request) {
    try {
        const auth = await requirePermission("accounting:create")
        if (!auth.authorized) return auth.response

        const body = await request.json()
        const { 
            date, 
            cashOnHand, 
            bankAccounts, 
            receivables,
            inventory,
            fixedAssets,
            digitalAssets,
            partnerCapital,
            rebalancingEnabled,
            liabilities,
            loans, 
            otherLiabilities 
        } = body

        if (!date) {
            return NextResponse.json({ error: "Date is required" }, { status: 400 })
        }

        const journalEntries: any[] = []
        const now = new Date()
        const effectiveDate = new Date(date)

        // Helper to record a journal entry
        const recordEntry = async (idPrefix: string, type: string, description: string, lines: { account_id: string, debit: number, credit: number, description: string }[]) => {
            const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0)
            const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0)
            
            // Allow small rounding differences if very close
            if (Math.abs(totalDebits - totalCredits) > 0.01) {
                console.warn(`Imbalanced entry attempt for ${idPrefix}: DR ${totalDebits}, CR ${totalCredits}`)
            }

            const entryId = `${idPrefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            const entry = {
                id: entryId,
                date: effectiveDate,
                reference: idPrefix,
                description,
                type: "OPENING_BALANCE",
                entries: lines,
                account_ids: [...new Set(lines.map(l => l.account_id))],
                total_debits: totalDebits,
                total_credits: totalCredits,
                created_at: now,
                status: "posted"
            }
            await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(entry)
            journalEntries.push(entryId)
        }

        // OB-01: Ahmed's Machine Contribution (Part of his total capital)
        // If Ahmed's capital is provided, we assume 47,400 is for machines as per OB-01
        if (partnerCapital?.ahmed >= 47400) {
            await recordEntry("OB-01", "OPENING_BALANCE", "Ahmed's Machine Contribution (2x Over Machines)", [
                { account_id: "1303", debit: 47400, credit: 0, description: "Contribution of 2x Over Machines" },
                { account_id: "3011", debit: 0, credit: 47400, description: "Capital contribution - Ahmed" }
            ])
        } else if (partnerCapital?.ahmed > 0) {
             // Fallback if less than machine value
             await recordEntry("OB-01", "OPENING_BALANCE", "Ahmed's Initial Contribution", [
                { account_id: "1303", debit: partnerCapital.ahmed, credit: 0, description: "Initial asset contribution" },
                { account_id: "3011", debit: 0, credit: partnerCapital.ahmed, description: "Capital contribution - Ahmed" }
            ])
        }

        // OB-02: Ibrahim's Cash Contribution
        if (partnerCapital?.ibrahim > 0) {
            // We'll record a portion as cash contribution if we have a split, 
            // but for simple setup we'll record his entered capital as initial cash DR 1101
            // Note: OB-05 will handle some of Ibrahim's capital too, so we'll adjust later or record simply.
            // According to OB entries, Ibrahim initially contributes 70,000 cash.
            const ibrahimCash = Math.min(partnerCapital.ibrahim, 70000)
            if (ibrahimCash > 0) {
                await recordEntry("OB-02", "OPENING_BALANCE", "Ibrahim's Cash Contribution", [
                    { account_id: "1101", debit: ibrahimCash, credit: 0, description: "Cash injection" },
                    { account_id: "3012", debit: 0, credit: ibrahimCash, description: "Capital contribution - Ibrahim" }
                ])
            }
        }

        // OB-03: Fathy's Cash Contribution
        if (partnerCapital?.fathy > 0) {
            await recordEntry("OB-03", "OPENING_BALANCE", "Fathy's Cash Contribution", [
                { account_id: "1101", debit: partnerCapital.fathy, credit: 0, description: "Initial cash contribution" },
                { account_id: "3013", debit: 0, credit: partnerCapital.fathy, description: "Capital contribution - Fathy" }
            ])
        }

        // OB-04: Purchase Physical Assets from Cash Pool
        // We look at entered fixedAssets and subtract OB-01 machine if it exists
        const machineryValue = (fixedAssets?.machinery || 0)
        const equipmentValue = (fixedAssets?.equipment || 0)
        const officeValue = (fixedAssets?.office || 0)
        const computersValue = (fixedAssets?.vehicles || 0) // Vehicles was used for Computers in UI? No, let's use UI field names
        
        // Use exact values from OB-04 description if they are provided in fixedAssets
        const ob04Lines = []
        if (fixedAssets?.machinery > 0) ob04Lines.push({ account_id: "1301", debit: fixedAssets.machinery, credit: 0, description: "Sewing Machines Purchase" })
        if (fixedAssets?.equipment > 0) ob04Lines.push({ account_id: "1303", debit: fixedAssets.equipment, credit: 0, description: "Production Equipment Purchase" })
        if (fixedAssets?.office > 0) ob04Lines.push({ account_id: "1304", debit: fixedAssets.office, credit: 0, description: "Office Equipment Purchase" })
        if (fixedAssets?.furniture > 0) ob04Lines.push({ account_id: "1306", debit: fixedAssets.furniture, credit: 0, description: "Furniture & Fixtures" })
        if (fixedAssets?.vehicles > 0) ob04Lines.push({ account_id: "1305", debit: fixedAssets.vehicles, credit: 0, description: "Computers & Tablets" })
        
        const totalPurchase = ob04Lines.reduce((sum, l) => sum + l.debit, 0)
        if (totalPurchase > 0) {
            ob04Lines.push({ account_id: "1101", debit: 0, credit: totalPurchase, description: "Payment from cash pool" })
            await recordEntry("OB-04", "OPENING_BALANCE", "Asset Purchases from Cash Pool", ob04Lines)
        }

        // OB-05: Website & App as Intangible Asset
        if (digitalAssets?.domains > 0 || digitalAssets?.software > 0) {
            const erpVal = (digitalAssets.domains || 0) + (digitalAssets.software || 0)
            await recordEntry("OB-05", "OPENING_BALANCE", "Website & App (Intangible Assets)", [
                { account_id: "1402", debit: erpVal, credit: 0, description: "ERP/Systems Valuation" },
                { account_id: "3011", debit: 0, credit: erpVal * 0.3, description: "Ahmed 30% Contribution" },
                { account_id: "3012", debit: 0, credit: erpVal * 0.7, description: "Ibrahim 70% Contribution" }
            ])
        }

        // OB-06: Capital Rebalancing (Selective)
        if (rebalancingEnabled) {
            // As per OB-06 example
            await recordEntry("OB-06", "OPENING_BALANCE", "Partner Capital Rebalancing (60/25/15 Alignment)", [
                { account_id: "3012", debit: 154400, credit: 0, description: "Rebalance Capital" },
                { account_id: "3013", debit: 78640, credit: 0, description: "Rebalance Capital" },
                { account_id: "3011", debit: 0, credit: 233040, description: "Rebalance Capital to Ahmed" }
            ])
        }

        // 7. Record remaining balances (Inventory, Receivables, Liabilities, Loans)
        const genericLines = []
        if (receivables > 0) genericLines.push({ account_id: "1110", debit: receivables, credit: 0, description: "Accounts Receivable" })
        if (inventory?.rawMaterials > 0) genericLines.push({ account_id: "1201", debit: inventory.rawMaterials, credit: 0, description: "Raw Materials" })
        if (inventory?.wip > 0) genericLines.push({ account_id: "1210", debit: inventory.wip, credit: 0, description: "WIP" })
        if (inventory?.finishedGoods > 0) genericLines.push({ account_id: "1220", debit: inventory.finishedGoods, credit: 0, description: "Finished Goods" })
        
        if (liabilities?.accountsPayable > 0) genericLines.push({ account_id: "2101", debit: 0, credit: liabilities.accountsPayable, description: "Accounts Payable" })
        if (liabilities?.accruedExpenses > 0) genericLines.push({ account_id: "2140", debit: 0, credit: liabilities.accruedExpenses, description: "Accrued Expenses" })
        
        if (Array.isArray(loans)) {
            for (const loan of loans) {
                if (loan.amount > 0) genericLines.push({ account_id: loan.accountId, debit: 0, credit: loan.amount, description: loan.name })
            }
        }

        // Plug remaining difference to Retained Earnings or Suspense to ensure balance
        let drTotal = genericLines.reduce((sum, l) => sum + l.debit, 0)
        let crTotal = genericLines.reduce((sum, l) => sum + l.credit, 0)
        
        if (Math.abs(drTotal - crTotal) > 0.01) {
            const diff = crTotal - drTotal
            genericLines.push({ 
                account_id: diff > 0 ? "1199" : "3100", // 1199 Suspense or 3100 Retained Earnings
                debit: diff > 0 ? diff : 0,
                credit: diff < 0 ? Math.abs(diff) : 0,
                description: "Opening Balance Cleanup / Rounding" 
            })
        }

        if (genericLines.length > 0) {
            await recordEntry("OB-GEN", "OPENING_BALANCE", "Miscellaneous Opening Balances", genericLines)
        }

        // Sync all affected account balances
        if (journalEntries.length > 0) {
            await CentralizedAccountingService.syncAllAccountBalances()
        }

        return NextResponse.json({ 
            success: true, 
            message: "ZEIEGA Opening Structure recorded",
            entriesCreated: journalEntries.length 
        })

    } catch (error) {
        console.error("Error creating opening balances:", error)
        return NextResponse.json({ error: "Failed to create opening balances" }, { status: 500 })
    }
}
