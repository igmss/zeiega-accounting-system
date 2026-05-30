import { supabase, TABLES, getServiceSupabase } from "../supabase"
import type { WorkOrder } from "../types"
import { ACCOUNTS } from "./enhanced-accounting-service"
import { JournalEntryType, JournalEntryService, JournalLine } from "./journal-entry-service"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"

export class ManufacturingAccountingService {
    static async createWorkOrder(salesOrderId: string) {
        const workOrderId = `WO-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`

        const workOrder: WorkOrder = {
            id: workOrderId,
            sales_order_id: salesOrderId,
            raw_materials_used: [],
            labor_hours: 0,
            labor_cost: 0,
            overhead_cost: 0,
            total_cost: 0,
            estimated_cost: 0,
            status: "pending",
            created_at: new Date().toISOString(),
        }

        await getServiceSupabase()
            .from(TABLES.WORK_ORDERS)
            .upsert(workOrder, { onConflict: "id" })
    }

    static async recordLaborApplied(
        workOrderId: string,
        laborHours: number,
        laborRate: number
    ): Promise<{ success: boolean; entryId?: string; totalCost?: number; error?: string }> {
        const totalCost = laborHours * laborRate

        if (totalCost <= 0) {
            return { success: false, error: "Labor cost must be positive" }
        }

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.WIP_LABOR,
                accountName: "WIP - Direct Labor",
                debit: totalCost,
                credit: 0,
                description: `Labor applied: ${laborHours} hours @ ${formatCurrency(laborRate)}/hr`,
            },
            {
                accountCode: ACCOUNTS.WAGES_PAYABLE,
                accountName: getAccountName(ACCOUNTS.WAGES_PAYABLE),
                debit: 0,
                credit: totalCost,
                description: `Direct labor for WO: ${workOrderId}`,
            },
        ]

        return {
            ...await JournalEntryService.createJournalEntry(
                JournalEntryType.LABOR_APPLIED,
                lines,
                workOrderId
            ),
            totalCost
        }
    }

    static async recordOverheadApplied(
        workOrderId: string,
        overheadAmount: number
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (overheadAmount <= 0) {
            return { success: true }
        }

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.WIP_OVERHEAD,
                accountName: "WIP - Overhead Applied",
                debit: overheadAmount,
                credit: 0,
                description: `Overhead applied to WO: ${workOrderId}`,
            },
            {
                accountCode: ACCOUNT_CODES.OH_APPLIED,
                accountName: "Manufacturing OH - Applied",
                debit: 0,
                credit: overheadAmount,
                description: `Overhead applied to WO: ${workOrderId}`,
            },
        ]

        return JournalEntryService.createJournalEntry(
            JournalEntryType.OVERHEAD_APPLIED,
            lines,
            workOrderId
        )
    }

    static async recordWIPOpening(
        workOrderId: string,
        estimatedCost: number
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (estimatedCost <= 0) {
            return { success: false, error: "Estimated cost must be positive" }
        }

        try {
            await getServiceSupabase()
                .from(TABLES.WORK_ORDERS)
                .update({
                    estimated_cost: estimatedCost,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", workOrderId)

            console.log(`📋 Work order ${workOrderId}: estimated cost recorded as ${formatCurrency(estimatedCost)} (no journal entry)`)
            return { success: true, entryId: `EST-${workOrderId}` }
        } catch (error) {
            console.error("Error storing estimated cost on work order:", error)
            return { success: false, error: error instanceof Error ? error.message : "Failed to store estimate" }
        }
    }

    static async recordWIPToFinishedGoods(
        workOrderId: string,
        totalCost: number,
        tx?: unknown
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (totalCost <= 0) {
            return { success: false, error: "Total cost must be positive" }
        }

        let matCost = totalCost
        let labCost = 0
        let ohCost = 0
        try {
            const { data: woDoc } = await getServiceSupabase()
                .from(TABLES.WORK_ORDERS)
                .select("*")
                .eq("id", workOrderId)
                .single()

            if (woDoc) {
                matCost = woDoc.material_cost || 0
                labCost = woDoc.labor_cost || 0
                ohCost = woDoc.overhead_cost || 0
            }
        } catch {}

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNTS.INVENTORY_FINISHED_GOODS,
                accountName: "Finished Goods Inventory",
                debit: totalCost,
                credit: 0,
                description: `Completed production from WO: ${workOrderId}`,
            },
        ]

        if (matCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WIP_MATERIALS,
                accountName: "WIP - Direct Materials",
                debit: 0,
                credit: matCost,
                description: `Materials transferred to FG`,
            })
        }
        if (labCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WIP_LABOR,
                accountName: "WIP - Direct Labor",
                debit: 0,
                credit: labCost,
                description: `Labor transferred to FG`,
            })
        }
        if (ohCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WIP_OVERHEAD,
                accountName: "WIP - Overhead Applied",
                debit: 0,
                credit: ohCost,
                description: `Overhead transferred to FG`,
            })
        }

        return JournalEntryService.createJournalEntry(
            JournalEntryType.WIP_TO_FINISHED_GOODS,
            lines,
            workOrderId,
            undefined,
            null,
            undefined,
            tx as any
        )
    }

    static async recordScrap(
        workOrderId: string,
        sku: string,
        quantityScrapped: number,
        unitCost: number,
        salvageValue: number,
        isAbnormal: boolean,
        reason: string,
        userId: string | null = null
    ): Promise<{ success: boolean; entryId?: string; recordId?: string; error?: string }> {
        const totalCost = quantityScrapped * unitCost
        if (totalCost <= 0) return { success: false, error: "Scrap cost must be positive" }
        if (salvageValue < 0 || salvageValue > totalCost) {
            return { success: false, error: "Salvage value must be between 0 and total scrap cost" }
        }

        const netLoss = totalCost - salvageValue
        const lines: JournalLine[] = []

        if (isAbnormal) {
            if (netLoss > 0) {
                lines.push({
                    accountCode: ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE,
                    accountName: getAccountName(ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE),
                    debit: netLoss,
                    credit: 0,
                    description: `Abnormal spoilage: ${sku} × ${quantityScrapped} units (${reason})`,
                })
            }
        }

        if (salvageValue > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.SCRAP_INVENTORY,
                accountName: getAccountName(ACCOUNT_CODES.SCRAP_INVENTORY),
                debit: salvageValue,
                credit: 0,
                description: `Salvage value: ${sku} scrap`,
            })
        }

        lines.push({
            accountCode: ACCOUNT_CODES.INVENTORY_WIP,
            accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
            debit: 0,
            credit: totalCost,
            description: `Scrap from WO ${workOrderId}: ${quantityScrapped} × ${sku}`,
        })

        if (!isAbnormal && netLoss > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.INVENTORY_WIP,
                accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
                debit: netLoss,
                credit: 0,
                description: `Normal scrap net cost charged to WO ${workOrderId}`,
            })
        }

        const result = await JournalEntryService.createJournalEntry(
            JournalEntryType.SCRAP_RECORD,
            lines,
            workOrderId,
            `Scrap record: ${quantityScrapped} × ${sku} from WO ${workOrderId}`,
            userId
        )

        if (!result.success) return result

        const recordId = `SCRAP-${Date.now()}`
        await getServiceSupabase()
            .from(TABLES.SCRAP_RECORDS)
            .upsert({
                id: recordId,
                workOrderId,
                sku,
                quantityScrapped,
                unitCost,
                totalCost,
                salvageValue,
                isAbnormal,
                reason,
                journalEntryId: result.entryId,
                created_at: new Date().toISOString(),
                created_by: userId,
            }, { onConflict: "id" })

        return { ...result, recordId }
    }

    static async recordRework(
        originalWorkOrderId: string,
        additionalMaterialCost: number,
        additionalLaborCost: number,
        additionalOverheadCost: number,
        isNormalRework: boolean,
        reason: string,
        userId: string | null = null
    ): Promise<{ success: boolean; entryId?: string; reworkOrderId?: string; error?: string }> {
        const totalReworkCost = additionalMaterialCost + additionalLaborCost + additionalOverheadCost
        if (totalReworkCost <= 0) return { success: false, error: "Rework cost must be positive" }

        const debitAccount = isNormalRework
            ? ACCOUNT_CODES.INVENTORY_WIP
            : ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE

        const lines: JournalLine[] = [
            {
                accountCode: debitAccount,
                accountName: getAccountName(debitAccount),
                debit: totalReworkCost,
                credit: 0,
                description: `Rework for WO ${originalWorkOrderId}: ${reason}`,
            },
        ]

        if (additionalMaterialCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
                accountName: getAccountName(ACCOUNT_CODES.RAW_MATERIALS_FABRIC),
                debit: 0,
                credit: additionalMaterialCost,
                description: `Rework materials`,
            })
        }
        if (additionalLaborCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION,
                accountName: getAccountName(ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION),
                debit: 0,
                credit: additionalLaborCost,
                description: `Rework direct labor`,
            })
        }
        if (additionalOverheadCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.MANUFACTURING_OVERHEAD,
                accountName: getAccountName(ACCOUNT_CODES.MANUFACTURING_OVERHEAD),
                debit: 0,
                credit: additionalOverheadCost,
                description: `Rework overhead`,
            })
        }

        const result = await JournalEntryService.createJournalEntry(
            JournalEntryType.REWORK_COSTS,
            lines,
            originalWorkOrderId,
            `Rework costs for WO ${originalWorkOrderId}`,
            userId
        )

        if (!result.success) return result

        const reworkOrderId = `RWK-${Date.now()}`
        await getServiceSupabase()
            .from(TABLES.REWORK_ORDERS)
            .upsert({
                id: reworkOrderId,
                originalWorkOrderId,
                reason,
                additionalMaterialCost,
                additionalLaborCost,
                additionalOverheadCost,
                totalReworkCost,
                isNormalRework,
                journalEntryId: result.entryId,
                status: "completed",
                created_at: new Date().toISOString(),
                created_by: userId,
            }, { onConflict: "id" })

        return { ...result, reworkOrderId }
    }

    static async recordLaborDetailed(
        workOrderId: string,
        regularHours: number,
        regularRate: number,
        overtimeHours: number = 0,
        overtimeRate: number = 0,
        idleHours: number = 0,
        userId: string | null = null
    ): Promise<{ success: boolean; entryId?: string; totalCost?: number; error?: string }> {
        const regularCost  = regularHours  * regularRate
        const overtimeCost = overtimeHours * overtimeRate
        const idleCost     = idleHours     * regularRate
        const totalWages   = regularCost + overtimeCost + idleCost

        if (totalWages <= 0) return { success: false, error: "Total wages must be positive" }

        const productiveCost = regularCost + overtimeCost
        const lines: JournalLine[] = []

        if (productiveCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.INVENTORY_WIP,
                accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
                debit: productiveCost,
                credit: 0,
                description: `Labor: ${regularHours}h regular + ${overtimeHours}h OT on WO ${workOrderId}`,
            })
        }
        if (idleCost > 0) {
            lines.push({
                accountCode: ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE,
                accountName: getAccountName(ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE),
                debit: idleCost,
                credit: 0,
                description: `Idle time: ${idleHours}h @ ${formatCurrency(regularRate)}/hr`,
            })
        }
        lines.push({
            accountCode: ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION,
            accountName: getAccountName(ACCOUNT_CODES.WAGES_PAYABLE_PRODUCTION),
            debit: 0,
            credit: totalWages,
            description: `Total wages payable for WO ${workOrderId}`,
        })

        return {
            ...await JournalEntryService.createJournalEntry(
                JournalEntryType.LABOR_APPLIED,
                lines,
                workOrderId,
                `Detailed labor for WO ${workOrderId}`,
                userId
            ),
            totalCost: productiveCost,
        }
    }
}
