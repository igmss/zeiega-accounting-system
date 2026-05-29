import { db, COLLECTIONS } from "../firebase"
import { ACCOUNT_CODES, getAccountName, isDebitNormalBalance } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"
import { CentralizedAccountingService } from "./centralized-accounting-service"

/**
 * Overhead allocation configuration
 */
export interface OverheadConfig {
  id: string
  fiscalYear: number
  allocationBase: "DLH" | "MH" | "DL_COST" | "UNITS" | "MATERIAL_COST"
  description: string
  estimatedTotalOH: number
  estimatedActivityLevel: number
  pohr: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: string
  // Support for departmental rates
  department?: string
}

/**
 * Overhead application record per work order
 */
export interface OverheadApplication {
  workOrderId: string
  actualActivity: number
  pohr: number
  appliedOH: number
  date: Date
  configId: string
}

/**
 * Over/Under-Applied Overhead disposition
 */
export interface OHDisposition {
  periodStart: Date
  periodEnd: Date
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

/**
 * Overhead Service — POHR calculation, application, and disposition
 *
 * Cost flow:
 *   1. Configure POHR per fiscal year
 *   2. Apply OH to WIP at POHR × actual activity
 *      DR WIP-OH (1712) / CR Manufacturing OH - Applied (5009)
 *   3. Actual indirect costs accumulate in Manufacturing OH - Control (5010)
 *   4. At period-end, close applied into control, isolate variance in 5011
 *   5. Dispose: immaterial → COGS; material → prorate across WIP/FG/COGS
 */
export class OverheadService {
  private static readonly COLLECTION = "acc_overhead_config"

  /**
   * Calculate POHR
   * POHR = Estimated Total OH ÷ Estimated Activity Level
   */
  static calculatePOHR(estimatedTotalOH: number, estimatedActivityLevel: number): number {
    if (estimatedActivityLevel <= 0) {
      throw new Error("Estimated activity level must be positive")
    }
    return Math.round((estimatedTotalOH / estimatedActivityLevel) * 100) / 100
  }

  /**
   * Create a new overhead allocation configuration
   */
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

      // Deactivate any existing active config for same year and base
      const existing = await db.collection(this.COLLECTION)
        .where("fiscalYear", "==", fiscalYear)
        .where("allocationBase", "==", allocationBase)
        .where("isActive", "==", true)
        .get()

      const batch = db.batch()
      for (const doc of existing.docs) {
        batch.update(doc.ref, { isActive: false, updatedAt: new Date() })
      }

      const pohr = this.calculatePOHR(estimatedTotalOH, estimatedActivityLevel)
      const configId = `OH-${fiscalYear}-${allocationBase}-${Date.now()}`
      const now = new Date()

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

      batch.set(db.collection(this.COLLECTION).doc(configId), config)
      await batch.commit()

      console.log(`✅ POHR configured: ${formatCurrency(pohr)} per ${allocationBase} (FY${fiscalYear})`)
      return { success: true, configId, pohr }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create OH config"
      }
    }
  }

  /**
   * Get active POHR for a fiscal year and allocation base
   */
  static async getActivePOHR(
    fiscalYear: number,
    allocationBase: OverheadConfig["allocationBase"] = "DLH"
  ): Promise<OverheadConfig | null> {
    try {
      const snapshot = await db.collection(this.COLLECTION)
        .where("fiscalYear", "==", fiscalYear)
        .where("allocationBase", "==", allocationBase)
        .where("isActive", "==", true)
        .limit(1)
        .get()

      if (snapshot.empty) return null
      return snapshot.docs[0].data() as OverheadConfig
    } catch (error) {
      console.error("Error getting active POHR:", error)
      return null
    }
  }

  /**
   * Apply overhead to a work order
   * DR: WIP - Overhead Applied (1712)
   * CR: Manufacturing OH - Applied (5009)
   */
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

      // Determine fiscal year if not provided
      const year = fiscalYear || new Date().getFullYear()

      // Get active POHR if not provided
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

      // Create journal entry
      const entryId = `OH-${workOrderId}-${Date.now()}`
      const now = new Date()

      const journalEntry = {
        id: entryId,
        date: now,
        type: "OVERHEAD_APPLIED",
        reference_doc: workOrderId,
        description: `Overhead applied to WO ${workOrderId}: ${actualActivity} × ${formatCurrency(rate)} = ${formatCurrency(appliedOH)}`,
        entries: [
          {
            account_id: ACCOUNT_CODES.WIP_OVERHEAD,
            account_name: getAccountName(ACCOUNT_CODES.WIP_OVERHEAD),
            debit: appliedOH,
            credit: 0,
              description: `Overhead applied: ${actualActivity} units @ ${formatCurrency(rate)}/unit`,
          },
          {
            account_id: ACCOUNT_CODES.OH_APPLIED,
            account_name: getAccountName(ACCOUNT_CODES.OH_APPLIED),
            debit: 0,
            credit: appliedOH,
            description: `OH applied to WO: ${workOrderId}`,
          },
        ],
        account_ids: [ACCOUNT_CODES.WIP_OVERHEAD, ACCOUNT_CODES.OH_APPLIED],
        total_debits: appliedOH,
        total_credits: appliedOH,
        created_at: now,
        created_by: userId,
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

      // Sync affected accounts
      await CentralizedAccountingService.syncMultipleAccountBalances([ACCOUNT_CODES.WIP_OVERHEAD, ACCOUNT_CODES.OH_APPLIED])

      // Update work order overhead cost
      const woRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId)
      const woDoc = await woRef.get()
      if (woDoc.exists) {
        const woData = woDoc.data()
        const currentOH = woData?.overhead_cost || 0
        await woRef.update({
          overhead_cost: currentOH + appliedOH,
          total_cost: (woData?.total_cost || 0) + appliedOH,
          updated_at: now,
        })
      }

      console.log(`✅ Applied ${formatCurrency(appliedOH)} OH to WO ${workOrderId}`)
      return { success: true, entryId, appliedOH }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to apply overhead"
      }
    }
  }

  /**
   * Calculate total actual overhead incurred during a period
   * Sums all actual OH accounts: 5005 (Factory Rent), 5006 (Utilities),
   * 5007 (Maintenance), 5008 (Depreciation-Factory)
   */
  static async getActualOverhead(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const ohAccounts = [
      ACCOUNT_CODES.FACTORY_RENT,        // 5005
      ACCOUNT_CODES.FACTORY_UTILITIES,   // 5006
      ACCOUNT_CODES.MACHINE_MAINTENANCE, // 5007
      ACCOUNT_CODES.DEPRECIATION_FACTORY,// 5008
    ]

    let total = 0
    for (const code of ohAccounts) {
      const snapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
        .where("account_ids", "array-contains", code)
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .get()

      for (const doc of snapshot.docs) {
        const entry = doc.data()
        for (const line of entry.entries || []) {
          if (line.account_id === code) {
            total += (line.debit || 0) - (line.credit || 0)
          }
        }
      }
    }
    return total
  }

  /**
   * Calculate total overhead applied during a period
   * Sums credits to 5009 (Manufacturing OH - Applied)
   */
  static async getAppliedOverhead(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const snapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
      .where("account_ids", "array-contains", ACCOUNT_CODES.OH_APPLIED)
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .get()

    let total = 0
    for (const doc of snapshot.docs) {
      const entry = doc.data()
      for (const line of entry.entries || []) {
        if (line.account_id === ACCOUNT_CODES.OH_APPLIED) {
          total += (line.credit || 0) - (line.debit || 0)
        }
      }
    }
    return total
  }

  /**
   * Close over/under-applied overhead at period-end (2-step process).
   *
   * Step 1: Close Applied into Control    DR 5009 OH Applied / CR 5010 OH Control
   *   → 5010 now holds the net variance only
   * Step 2: Transfer variance to disposal  DR/CR 5010 ↔ 5011 OH Variance
   * Step 3: Dispose variance to COGS or prorate
   */
  static async closeOverheadToVariance(
    startDate: Date,
    endDate: Date,
    userId: string = "system"
  ): Promise<{ success: boolean; underApplied?: number; overApplied?: number; disposedAmount?: number; error?: string }> {
    try {
      const actualOH = await this.getActualOverhead(startDate, endDate)
      const appliedOH = await this.getAppliedOverhead(startDate, endDate)
      const variance = appliedOH - actualOH // + = over-applied, - = under-applied

      if (Math.abs(variance) < 0.01) {
        return { success: true, underApplied: 0, overApplied: 0, disposedAmount: 0 }
      }

      const absV = Math.abs(variance)
      const now = new Date()
      const closeId = `OHCLOSE-${Date.now()}`

      // Step 1: Close Applied (5009) into Control (5010)
      // DR 5009 OH Applied (eliminate credit) / CR 5010 OH Control (reduce debit)
      const step1 = {
        id: `${closeId}-S1`,
        date: endDate,
        type: "OVERHEAD_CLOSE",
        reference_doc: `OH-CLOSE-${startDate.toISOString().split("T")[0]}`,
        description: `Close OH Applied to OH Control: ${formatCurrency(absV)}`,
        entries: [
          {
            account_id: ACCOUNT_CODES.OH_APPLIED,
            account_name: getAccountName(ACCOUNT_CODES.OH_APPLIED),
            debit: absV,
            credit: 0,
            description: "Eliminate applied OH credit balance",
          },
          {
            account_id: ACCOUNT_CODES.OH_CONTROL,
            account_name: getAccountName(ACCOUNT_CODES.OH_CONTROL),
            debit: 0,
            credit: absV,
            description: "Reduce actual OH debit balance to isolate variance",
          },
        ],
        account_ids: [ACCOUNT_CODES.OH_APPLIED, ACCOUNT_CODES.OH_CONTROL],
        total_debits: absV,
        total_credits: absV,
        created_at: now,
        created_by: userId,
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(step1.id).set(step1)

      await CentralizedAccountingService.syncMultipleAccountBalances([ACCOUNT_CODES.OH_APPLIED, ACCOUNT_CODES.OH_CONTROL])

      // Step 2: Transfer variance to Over/Under-Applied OH (5011)
      const isOver = variance > 0
      const dispId = `${closeId}-S2`
      const step2 = {
        id: dispId,
        date: endDate,
        type: "OVERHEAD_DISPOSITION",
        reference_doc: step1.reference_doc,
        description: `${isOver ? "Over" : "Under"}-applied OH ${formatCurrency(absV)} → disposed to COGS`,
        entries: [
          {
            account_id: ACCOUNT_CODES.OH_VARIANCE,
            account_name: getAccountName(ACCOUNT_CODES.OH_VARIANCE),
            debit: isOver ? 0 : absV,   // Under-applied = DR variance
            credit: isOver ? absV : 0,  // Over-applied = CR variance
            description: `OH variance isolated at period-end`,
          },
          {
            account_id: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
            account_name: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
            debit: isOver ? absV : 0,
            credit: isOver ? 0 : absV,
            description: `Dispose ${isOver ? "over" : "under"}-applied OH to COGS`,
          },
        ],
        account_ids: [ACCOUNT_CODES.OH_VARIANCE, ACCOUNT_CODES.COST_OF_GOODS_SOLD],
        total_debits: absV,
        total_credits: absV,
        created_at: now,
        created_by: userId,
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(dispId).set(step2)

      await CentralizedAccountingService.syncMultipleAccountBalances([ACCOUNT_CODES.OH_VARIANCE, ACCOUNT_CODES.COST_OF_GOODS_SOLD])

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
    materialityThreshold: number = 0.1, // 10% of actual OH
    userId: string = "system"
  ): Promise<{ success: boolean; disposition?: OHDisposition; error?: string }> {
    try {
      const actualOH = await this.getActualOverhead(startDate, endDate)
      const appliedOH = await this.getAppliedOverhead(startDate, endDate)
      const variance = appliedOH - actualOH // Positive = over-applied, negative = under-applied

      const isMaterial = actualOH > 0
        ? Math.abs(variance) / actualOH > materialityThreshold
        : Math.abs(variance) > 1000

      const disposition: OHDisposition = {
        periodStart: startDate,
        periodEnd: endDate,
        totalActualOH: actualOH,
        totalAppliedOH: appliedOH,
        variance,
        dispositionMethod: isMaterial ? "prorate" : "cogs_only",
      }

      if (Math.abs(variance) < 0.01) {
        return { success: true, disposition } // No variance to dispose
      }

      if (!isMaterial) {
        // Close entirely to COGS (5301)
        const cogsEntryId = `OHDISP-${Date.now()}`
        const isOverApplied = variance > 0
        const absVariance = Math.abs(variance)

        const journalEntry = {
          id: cogsEntryId,
          date: endDate,
          type: "OVERHEAD_DISPOSITION",
          reference_doc: `OH-DISPOSITION-${startDate.toISOString().split("T")[0]}`,
          description: `OH variance disposition: ${isOverApplied ? "Over" : "Under"}-applied ${formatCurrency(absVariance)} → COGS`,
          entries: [
            {
              account_id: ACCOUNT_CODES.OH_APPLIED,
              account_name: getAccountName(ACCOUNT_CODES.OH_APPLIED),
              debit: isOverApplied ? absVariance : 0,
              credit: isOverApplied ? 0 : absVariance,
              description: `Clear OH applied balance`,
            },
            {
              account_id: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
              account_name: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
              debit: isOverApplied ? 0 : absVariance,
              credit: isOverApplied ? absVariance : 0,
              description: `Dispose ${isOverApplied ? "over" : "under"}-applied OH to COGS`,
            },
          ],
          account_ids: [ACCOUNT_CODES.OH_APPLIED, ACCOUNT_CODES.COST_OF_GOODS_SOLD],
          total_debits: absVariance,
          total_credits: absVariance,
          created_at: new Date(),
          created_by: userId,
        }

        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(cogsEntryId).set(journalEntry)
        await CentralizedAccountingService.syncMultipleAccountBalances([ACCOUNT_CODES.OH_APPLIED, ACCOUNT_CODES.COST_OF_GOODS_SOLD])
        disposition.journalEntryId = cogsEntryId
      } else {
        // Prorate across WIP, FG, COGS
        // Get balances
        const getBal = async (code: string) => {
          const snap = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
            .where("account_ids", "array-contains", code)
            .where("date", "<=", endDate)
            .get()
          let d = 0, c = 0
          for (const doc of snap.docs) {
            for (const line of doc.data().entries || []) {
              if (line.account_id === code) { d += line.debit || 0; c += line.credit || 0 }
            }
          }
          return Math.abs(isDebitNormalBalance(code) ? d - c : c - d)
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
        const dispId = `OHDISP-${Date.now()}`
        const isDr = !isOver // Under-applied = debit these accounts (increase)

        const entries: any[] = [
          // Clear Manufacturing OH account
          {
            account_id: ACCOUNT_CODES.OH_APPLIED,
            account_name: getAccountName(ACCOUNT_CODES.OH_APPLIED),
            debit: isOver ? absV : 0,
            credit: isOver ? 0 : absV,
            description: `Clear applied OH balance`,
          },
          // WIP proration
          {
            account_id: ACCOUNT_CODES.INVENTORY_WIP,
            account_name: getAccountName(ACCOUNT_CODES.INVENTORY_WIP),
            debit: isDr ? Math.abs(disposition.allocations!.wip) : 0,
            credit: !isDr ? Math.abs(disposition.allocations!.wip) : 0,
            description: `OH proration to WIP (${((wipBal / totalBal) * 100).toFixed(1)}%)`,
          },
          // FG proration
          {
            account_id: ACCOUNT_CODES.INVENTORY_FINISHED_GOODS,
            account_name: getAccountName(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS),
            debit: isDr ? Math.abs(disposition.allocations!.finishedGoods) : 0,
            credit: !isDr ? Math.abs(disposition.allocations!.finishedGoods) : 0,
            description: `OH proration to FG (${((fgBal / totalBal) * 100).toFixed(1)}%)`,
          },
          // COGS proration
          {
            account_id: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
            account_name: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
            debit: isDr ? Math.abs(disposition.allocations!.cogs) : 0,
            credit: !isDr ? Math.abs(disposition.allocations!.cogs) : 0,
            description: `OH proration to COGS (${((cogsBal / totalBal) * 100).toFixed(1)}%)`,
          },
        ]

        const totalDebits = entries.reduce((s, e) => s + (e.debit || 0), 0)
        const totalCredits = entries.reduce((s, e) => s + (e.credit || 0), 0)

        const journalEntry = {
          id: dispId,
          date: endDate,
          type: "OVERHEAD_DISPOSITION",
          reference_doc: `OH-PRORATE-${startDate.toISOString().split("T")[0]}`,
          description: `OH ${isOver ? "over" : "under"}-applied variance ${formatCurrency(absV)} prorated`,
          entries,
          account_ids: entries.map((e: any) => e.account_id),
          total_debits: totalDebits,
          total_credits: totalCredits,
          created_at: new Date(),
          created_by: userId,
        }

        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(dispId).set(journalEntry)
        await CentralizedAccountingService.syncMultipleAccountBalances([ACCOUNT_CODES.OH_APPLIED, ACCOUNT_CODES.INVENTORY_WIP, ACCOUNT_CODES.INVENTORY_FINISHED_GOODS, ACCOUNT_CODES.COST_OF_GOODS_SOLD])
        disposition.journalEntryId = dispId
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

  /**
   * Get overhead absorption report for a period
   */
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
