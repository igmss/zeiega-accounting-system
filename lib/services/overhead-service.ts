import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

export interface OverheadConfig {
  id: string
  fiscalYear: number
  allocationBase: "DLH" | "MH" | "DL_COST" | "UNITS" | "MATERIAL_COST"
  description: string
  estimatedTotalOH: number
  estimatedActivityLevel: number
  pohr: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
  department?: string
}

export interface OverheadApplication {
  workOrderId: string
  actualActivity: number
  pohr: number
  appliedOH: number
  date: string
  configId: string
}

export interface OHDisposition {
  periodStart: string
  periodEnd: string
  totalActualOH: number
  totalAppliedOH: number
  variance: number
  dispositionMethod: "cogs_only" | "prorate"
  allocations?: {
    wip: number
    finishedGoods: number
    cogs: number
  }
  journalEntryId?: string
}

export class OverheadService {
  private static readonly TABLE = TABLES.OVERHEAD_CONFIG

  static calculatePOHR(estimatedTotalOH: number, estimatedActivityLevel: number): number {
    if (estimatedActivityLevel <= 0) {
      throw new Error("Estimated activity level must be positive")
    }
    return Math.round((estimatedTotalOH / estimatedActivityLevel) * 100) / 100
  }

  static async createOverheadConfig(
    fiscalYear: number,
    allocationBase: OverheadConfig["allocationBase"],
    estimatedTotalOH: number,
    estimatedActivityLevel: number,
    department?: string,
    createdBy: string = "system"
  ): Promise<{ success: boolean; configId?: string; pohr?: number; error?: string }> {
    try {
      if (estimatedTotalOH <= 0 || estimatedActivityLevel <= 0) {
        return { success: false, error: "Estimated OH and activity level must be positive" }
      }

      const now = new Date().toISOString()
      const { data: existing } = await getServiceSupabase().from(this.TABLE)
        .select("id")
        .eq("fiscalYear", fiscalYear)
        .eq("allocationBase", allocationBase)
        .eq("isActive", true)

      for (const row of (existing || [])) {
        await getServiceSupabase().from(this.TABLE).update({ isActive: false, updatedAt: now }).eq("id", row.id)
      }

      const pohr = this.calculatePOHR(estimatedTotalOH, estimatedActivityLevel)
      const configId = `OH-${fiscalYear}-${allocationBase}-${Date.now()}`

      const config: OverheadConfig = {
        id: configId,
        fiscalYear,
        allocationBase,
        description: `${allocationBase} rate for FY${fiscalYear}`,
        estimatedTotalOH,
        estimatedActivityLevel,
        pohr,
        isActive: true,
        department,
        createdAt: now,
        updatedAt: now,
        createdBy,
      }

      const { error } = await getServiceSupabase().from(this.TABLE).insert(config)
      if (error) throw error

      console.log(`✅ POHR configured: ${formatCurrency(pohr)} per ${allocationBase} (FY${fiscalYear})`)
      return { success: true, configId, pohr }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create OH config"
      }
    }
  }

  static async getActivePOHR(
    fiscalYear: number,
    allocationBase: OverheadConfig["allocationBase"] = "DLH"
  ): Promise<OverheadConfig | null> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE)
        .select("*")
        .eq("fiscalYear", fiscalYear)
        .eq("allocationBase", allocationBase)
        .eq("isActive", true)
        .limit(1)
        .single()

      if (error || !data) return null
      return data as OverheadConfig
    } catch (error) {
      console.error("Error getting active POHR:", error)
      return null
    }
  }

  static async applyOverheadToWorkOrder(
    workOrderId: string,
    actualActivity: number,
    pohr?: number,
    fiscalYear?: number,
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; appliedOH?: number; error?: string }> {
    try {
      if (actualActivity <= 0) {
        return { success: false, error: "Actual activity must be positive" }
      }

      const year = fiscalYear || new Date().getFullYear()

      let rate = pohr
      if (!rate) {
        const config = await this.getActivePOHR(year)
        if (!config) {
          return {
            success: false,
            error: `No active POHR found for FY${year}. Configure one first.`
          }
        }
        rate = config.pohr
      }

      const appliedOH = Math.round(actualActivity * rate * 100) / 100
      const entryId = `OH-${workOrderId}-${Date.now()}`
      const now = new Date().toISOString()

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.OVERHEAD_APPLIED,
        [
          {
            accountCode: ACCOUNT_CODES.WIP_OVERHEAD,
            accountName: getAccountName(ACCOUNT_CODES.WIP_OVERHEAD),
            debit: appliedOH,
            credit: 0,
            description: `Overhead applied: ${actualActivity} units @ ${formatCurrency(rate)}/unit`,
          },
          {
            accountCode: ACCOUNT_CODES.OH_APPLIED,
            accountName: getAccountName(ACCOUNT_CODES.OH_APPLIED),
            debit: 0,
            credit: appliedOH,
            description: `OH applied to WO: ${workOrderId}`,
          },
        ],
        workOrderId,
        `Overhead applied to WO ${workOrderId}: ${actualActivity} × ${formatCurrency(rate)} = ${formatCurrency(appliedOH)}`,
        userId
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      const { data: woData } = await getServiceSupabase().from(TABLES.WORK_ORDERS).select("*").eq("id", workOrderId).single()
      if (woData) {
        const currentOH = woData.overhead_cost || 0
        await getServiceSupabase().from(TABLES.WORK_ORDERS).update({
          overhead_cost: currentOH + appliedOH,
          total_cost: (woData.total_cost || 0) + appliedOH,
          updated_at: now,
        }).eq("id", workOrderId)
      }

      console.log(`✅ Applied ${formatCurrency(appliedOH)} OH to WO ${workOrderId}`)
      return { success: true, entryId: result.entryId, appliedOH }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to apply overhead"
      }
    }
  }

  static async getActualOverhead(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const ohAccounts = [
      ACCOUNT_CODES.FACTORY_RENT,
      ACCOUNT_CODES.FACTORY_UTILITIES,
      ACCOUNT_CODES.MACHINE_MAINTENANCE,
      ACCOUNT_CODES.DEPRECIATION_FACTORY,
    ]

    const start = startDate.toISOString()
    const end = endDate.toISOString()
    let total = 0

    for (const code of ohAccounts) {
      const { data } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
        .select("*")
        .contains("account_ids", [code])
        .gte("date", start)
        .lte("date", end)

      for (const entry of (data || [])) {
        for (const line of entry.entries || []) {
          if (line.account_id === code) {
            total += (line.debit || 0) - (line.credit || 0)
          }
        }
      }
    }
    return total
  }

  static async getAppliedOverhead(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const start = startDate.toISOString()
    const end = endDate.toISOString()

    const { data } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
      .select("*")
      .contains("account_ids", [ACCOUNT_CODES.OH_APPLIED])
      .gte("date", start)
      .lte("date", end)

    let total = 0
    for (const entry of (data || [])) {
      for (const line of entry.entries || []) {
        if (line.account_id === ACCOUNT_CODES.OH_APPLIED) {
          total += (line.credit || 0) - (line.debit || 0)
        }
      }
    }
    return total
  }

  static async closeOverheadToVariance(
    startDate: Date,
    endDate: Date,
    userId: string = "system"
  ): Promise<{ success: boolean; underApplied?: number; overApplied?: number; disposedAmount?: number; error?: string }> {
    try {
      const actualOH = await this.getActualOverhead(startDate, endDate)
      const appliedOH = await this.getAppliedOverhead(startDate, endDate)
      const variance = appliedOH - actualOH

      if (Math.abs(variance) < 0.01) {
        return { success: true, underApplied: 0, overApplied: 0, disposedAmount: 0 }
      }

      const absV = Math.abs(variance)
      const refDoc = `OH-CLOSE-${startDate.toISOString().split("T")[0]}`
      const endStr = endDate.toISOString()
      
      await JournalEntryService.createJournalEntry(
        JournalEntryType.GENERAL,
        [
          {
            accountCode: ACCOUNT_CODES.OH_APPLIED,
            accountName: getAccountName(ACCOUNT_CODES.OH_APPLIED),
            debit: absV,
            credit: 0,
            description: "Eliminate applied OH credit balance",
          },
          {
            accountCode: ACCOUNT_CODES.OH_CONTROL,
            accountName: getAccountName(ACCOUNT_CODES.OH_CONTROL),
            debit: 0,
            credit: absV,
            description: "Reduce actual OH debit balance to isolate variance",
          },
        ],
        refDoc,
        `Close OH Applied to OH Control: ${formatCurrency(absV)}`,
        userId,
        endDate
      )

      const isOver = variance > 0
      
      await JournalEntryService.createJournalEntry(
        JournalEntryType.GENERAL,
        [
          {
            accountCode: ACCOUNT_CODES.OH_VARIANCE,
            accountName: getAccountName(ACCOUNT_CODES.OH_VARIANCE),
            debit: isOver ? 0 : absV,
            credit: isOver ? absV : 0,
            description: `OH variance isolated at period-end`,
          },
          {
            accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
            accountName: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
            debit: isOver ? absV : 0,
            credit: isOver ? 0 : absV,
            description: `Dispose ${isOver ? "over" : "under"}-applied OH to COGS`,
          },
        ],
        refDoc,
        `${isOver ? "Over" : "Under"}-applied OH ${formatCurrency(absV)} → disposed to COGS`,
        userId,
        endDate
      )

      console.log(`✅ OH close: ${formatCurrency(absV)} variance disposed to COGS`)
      return {
        success: true,
        underApplied: isOver ? 0 : absV,
        overApplied: isOver ? absV : 0,
        disposedAmount: absV,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close overhead variance"
      }
    }
  }

  static async disposeOverheadVariance(
    startDate: Date,
    endDate: Date,
    materialityThreshold: number = 0.1,
    userId: string = "system"
  ): Promise<{ success: boolean; disposition?: OHDisposition; error?: string }> {
    try {
      const actualOH = await this.getActualOverhead(startDate, endDate)
      const appliedOH = await this.getAppliedOverhead(startDate, endDate)
      const variance = appliedOH - actualOH

      const isMaterial = actualOH > 0
        ? Math.abs(variance) / actualOH > materialityThreshold
        : Math.abs(variance) > 1000

      const disposition: OHDisposition = {
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        totalActualOH: actualOH,
        totalAppliedOH: appliedOH,
        variance,
        dispositionMethod: isMaterial ? "prorate" : "cogs_only",
      }

      if (Math.abs(variance) < 0.01) {
        return { success: true, disposition }
      }

      if (!isMaterial) {
        const isOverApplied = variance > 0
        const absVariance = Math.abs(variance)
        const endStr = endDate.toISOString()

        const cogsResult = await JournalEntryService.createJournalEntry(
          JournalEntryType.GENERAL,
          [
            {
              accountCode: ACCOUNT_CODES.OH_APPLIED,
              accountName: getAccountName(ACCOUNT_CODES.OH_APPLIED),
              debit: isOverApplied ? absVariance : 0,
              credit: isOverApplied ? 0 : absVariance,
              description: `Clear OH applied balance`,
            },
            {
              accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
              accountName: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
              debit: isOverApplied ? 0 : absVariance,
              credit: isOverApplied ? absVariance : 0,
              description: `Dispose ${isOverApplied ? "over" : "under"}-applied OH to COGS`,
            },
          ],
          `OH-DISPOSITION-${startDate.toISOString().split("T")[0]}`,
          `OH variance disposition: ${isOverApplied ? "Over" : "Under"}-applied ${formatCurrency(absVariance)} → COGS`,
          userId,
          endDate
        )
        if (cogsResult.success && cogsResult.entryId) {
          disposition.journalEntryId = cogsResult.entryId
        }
      } else {
        const endStr = endDate.toISOString()
        const getBal = async (code: string) => {
          const { data: snap } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
            .select("*")
            .contains("account_ids", [code])
            .lte("date", endStr)
          let d = 0, c = 0
          for (const doc of (snap || [])) {
            for (const line of doc.entries || []) {
              if (line.account_id === code) { d += line.debit || 0; c += line.credit || 0 }
            }
          }
          return Math.abs(ACCOUNT_CODES.INVENTORY_WIP === code ? d - c : c - d)
        }

        const wipBal = await getBal(ACCOUNT_CODES.INVENTORY_WIP)
        const fgBal = await getBal(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS)
        const cogsBal = await getBal(ACCOUNT_CODES.COST_OF_GOODS_SOLD)
        const totalBal = wipBal + fgBal + cogsBal

        if (totalBal <= 0) {
          return { success: false, error: "Cannot prorate: no balances in WIP/FG/COGS" }
        }

        const wipShare = (wipBal / totalBal) * variance
        const fgShare = (fgBal / totalBal) * variance
        const cogsShare = (cogsBal / totalBal) * variance

        disposition.allocations = {
          wip: Math.round(wipShare * 100) / 100,
          finishedGoods: Math.round(fgShare * 100) / 100,
          cogs: Math.round(cogsShare * 100) / 100,
        }

        const isOver = variance > 0
        const absV = Math.abs(variance)
        const isDr = !isOver

        const entries: any[] = [
          {
            account_id: ACCOUNT_CODES.OH_APPLIED,
            account_name: getAccountName(ACCOUNT_CODES.OH_APPLIED),
            debit: isOver ? absV : 0,
            credit: isOver ? 0 : absV,
            description: `Clear applied OH balance`,
          },
          {
            account_id: ACCOUNT_CODES.INVENTORY_WIP,
            account_name: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
            debit: isDr ? Math.abs(disposition.allocations!.wip) : 0,
            credit: !isDr ? Math.abs(disposition.allocations!.wip) : 0,
            description: `OH proration to WIP (${((wipBal / totalBal) * 100).toFixed(1)}%)`,
          },
          {
            account_id: ACCOUNT_CODES.INVENTORY_FINISHED_GOODS,
            account_name: getAccountName(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS),
            debit: isDr ? Math.abs(disposition.allocations!.finishedGoods) : 0,
            credit: !isDr ? Math.abs(disposition.allocations!.finishedGoods) : 0,
            description: `OH proration to FG (${((fgBal / totalBal) * 100).toFixed(1)}%)`,
          },
          {
            account_id: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
            account_name: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
            debit: isDr ? Math.abs(disposition.allocations!.cogs) : 0,
            credit: !isDr ? Math.abs(disposition.allocations!.cogs) : 0,
            description: `OH proration to COGS (${((cogsBal / totalBal) * 100).toFixed(1)}%)`,
          },
        ]

        const dispResult = await JournalEntryService.createJournalEntry(
          JournalEntryType.GENERAL,
          entries.map((e: any) => ({
            accountCode: e.account_id,
            accountName: e.account_name,
            debit: e.debit || 0,
            credit: e.credit || 0,
            description: e.description,
          })),
          `OH-PRORATE-${startDate.toISOString().split("T")[0]}`,
          `OH ${isOver ? "over" : "under"}-applied variance ${formatCurrency(absV)} prorated`,
          userId,
          endDate
        )
        if (dispResult.success && dispResult.entryId) {
          disposition.journalEntryId = dispResult.entryId
        }
      }

      console.log(`✅ OH variance of ${formatCurrency(variance)} disposed (${disposition.dispositionMethod})`)
      return { success: true, disposition }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to dispose OH variance"
      }
    }
  }

  static async getAbsorptionReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    actualOH: number
    appliedOH: number
    variance: number
    absorptionRate: number
    status: "under" | "over" | "balanced"
    recommendation: string
  }> {
    const actualOH = await this.getActualOverhead(startDate, endDate)
    const appliedOH = await this.getAppliedOverhead(startDate, endDate)
    const variance = appliedOH - actualOH
    const absorptionRate = actualOH > 0 ? (appliedOH / actualOH) * 100 : 0

    let status: "under" | "over" | "balanced"
    let recommendation: string

    if (Math.abs(absorptionRate - 100) < 5) {
      status = "balanced"
      recommendation = "Absorption is within 5% tolerance. No action required."
    } else if (absorptionRate < 95) {
      status = "under"
      recommendation = `Under-absorption: only ${absorptionRate.toFixed(1)}% of actual OH absorbed. Review POHR — it may be too low, or volume is below expectations.`
    } else {
      status = "over"
      recommendation = `Over-absorption: ${absorptionRate.toFixed(1)}% absorbed. POHR may be too high. Consider lowering the rate or investigate if volume exceeded estimates.`
    }

    return { actualOH, appliedOH, variance, absorptionRate, status, recommendation }
  }
}
