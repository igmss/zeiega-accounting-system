import { db, COLLECTIONS } from "../firebase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { CentralizedAccountingService } from "./centralized-accounting-service"

/**
 * Standard cost configuration per design
 */
export interface StandardCost {
  designId: string
  designName: string

  // Direct materials
  standardDMQuantity: number  // per unit
  standardDMPrice: number     // per unit of material
  standardDMCost: number      // per finished unit

  // Direct labor
  standardDLHours: number     // per unit
  standardDLRate: number      // per hour
  standardDLCost: number      // per finished unit

  // Variable overhead (based on DLH)
  standardVOHRate: number     // per DLH
  standardVOHCost: number     // per finished unit

  // Fixed overhead
  budgetedFOH: number         // annual
  budgetedActivity: number    // DLH
  standardFOHRate: number     // per DLH

  updatedAt: Date
  updatedBy: string
}

/**
 * Variance analysis result for a single job/work order
 */
export interface JobVariance {
  workOrderId: string
  designId?: string
  quantity: number

  // Material variances
  materialPriceVariance: number
  materialUsageVariance: number
  totalMaterialVariance: number

  // Labor variances
  laborRateVariance: number
  laborEfficiencyVariance: number
  totalLaborVariance: number

  // Overhead variances (4-way)
  vohSpendingVariance: number
  vohEfficiencyVariance: number
  fohBudgetVariance: number
  fohVolumeVariance: number
  totalVOHVariance: number
  totalFOHVariance: number

  // Summary
  totalVariance: number
  isFavorable: boolean
}

/**
 * Variance Analysis Service
 *
 * Compares actual job costs against standard costs and computes:
 *   - Material Price & Usage variances
 *   - Labor Rate & Efficiency variances
 *   - 4-way Overhead variances (VOH Spending, VOH Efficiency, FOH Budget, FOH Volume)
 */
export class VarianceService {
  private static readonly STANDARD_COST_COLLECTION = "acc_standard_costs"

  /**
   * Set standard costs for a design
   */
  static async setStandardCost(
    designId: string,
    designName: string,
    standard: Omit<StandardCost, "designId" | "designName" | "updatedAt">,
    userId: string = "system"
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const standardCost: StandardCost = {
        designId,
        designName,
        ...standard,
        updatedAt: new Date(),
        updatedBy: userId,
      }
      await db.collection(this.STANDARD_COST_COLLECTION).doc(designId).set(standardCost)
      console.log(`✅ Standard costs set for design ${designName} (${designId})`)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set standard costs"
      }
    }
  }

  /**
   * Get standard costs for a design
   */
  static async getStandardCost(designId: string): Promise<StandardCost | null> {
    try {
      const doc = await db.collection(this.STANDARD_COST_COLLECTION).doc(designId).get()
      return doc.exists ? (doc.data() as StandardCost) : null
    } catch {
      return null
    }
  }

  /**
   * Calculate all variances for a completed work order
   */
  static async calculateJobVariance(
    workOrderId: string,
    standard: StandardCost
  ): Promise<{ success: boolean; variance?: JobVariance; error?: string }> {
    try {
      const woDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get()
      if (!woDoc.exists) {
        return { success: false, error: "Work order not found" }
      }

      const wo = woDoc.data()
      const quantity = 1 // Default; can be derived from items.length if needed
      const sq = standard  // shorthand

      // ─── MATERIAL VARIANCES ───
      // Get actual materials issued
      const materialsIssued = wo?.materials_issued || []
      const rawMaterials = wo?.raw_materials_used || []
      const allMaterials = materialsIssued.length > 0 ? materialsIssued : rawMaterials

      let totalAQ = 0
      let totalAPxAQ = 0

      for (const mat of allMaterials) {
        const qty = mat.quantityIssued || mat.qty || 0
        const cost = mat.totalCost || (mat.qty * (mat.unitCost || mat.cost || 0)) || 0
        totalAQ += qty
        totalAPxAQ += cost
      }

      const totalSQ = sq.standardDMQuantity * quantity
      const totalAQTimesSP = totalAQ * sq.standardDMPrice
      const totalSQTimesSP = totalSQ * sq.standardDMPrice

      // Price Variance = AQ Purchased × (AP − SP) = (AP × AQ) − (SP × AQ)
      const materialPriceVariance = totalAPxAQ - totalAQTimesSP

      // Usage Variance = SP × (AQ Used − SQ Allowed)
      const materialUsageVariance = totalAQTimesSP - totalSQTimesSP

      // ─── LABOR VARIANCES ───
      const actualHours = wo?.labor_hours || 0
      const actualLaborCost = wo?.labor_cost || 0
      const actualRate = actualHours > 0 ? actualLaborCost / actualHours : 0
      const standardHours = sq.standardDLHours * quantity

      // Rate Variance = AH × (AR − SR)
      const laborRateVariance = actualHours * (actualRate - sq.standardDLRate)

      // Efficiency Variance = SR × (AH − SH Allowed)
      const laborEfficiencyVariance = sq.standardDLRate * (actualHours - standardHours)

      // ─── OVERHEAD VARIANCES (4-Way) ───
      const actualVOH = wo?.overhead_cost || 0  // Simplified: all OH treated as VOH for now
      const actualFOH = 0  // Fixed OH not separately tracked per job
      const budgetedFOHPerJob = sq.standardFOHRate * standardHours

      // VOH Spending = Actual VOH − (SR_VOH × AH)
      const vohSpendingVariance = actualVOH - (sq.standardVOHRate * actualHours)

      // VOH Efficiency = SR_VOH × (AH − SH Allowed)
      const vohEfficiencyVariance = sq.standardVOHRate * (actualHours - standardHours)

      // FOH Budget = Actual FOH − Budgeted FOH
      const fohBudgetVariance = actualFOH - sq.budgetedFOH

      // FOH Volume = Budgeted FOH − (SR_FOH × SH Allowed)
      const fohVolumeVariance = sq.budgetedFOH - (sq.standardFOHRate * standardHours)

      // Totals
      const totalMaterialVariance = materialPriceVariance + materialUsageVariance
      const totalLaborVariance = laborRateVariance + laborEfficiencyVariance
      const totalVOHVariance = vohSpendingVariance + vohEfficiencyVariance
      const totalFOHVariance = fohBudgetVariance + fohVolumeVariance
      const totalVariance = totalMaterialVariance + totalLaborVariance + totalVOHVariance + totalFOHVariance

      // Positive variance = unfavorable (actual > standard)
      // Negative variance = favorable (actual < standard)
      const isFavorable = totalVariance < 0

      const variance: JobVariance = {
        workOrderId,
        designId: wo?.design_id,
        quantity,
        materialPriceVariance: Math.round(materialPriceVariance * 100) / 100,
        materialUsageVariance: Math.round(materialUsageVariance * 100) / 100,
        totalMaterialVariance: Math.round(totalMaterialVariance * 100) / 100,
        laborRateVariance: Math.round(laborRateVariance * 100) / 100,
        laborEfficiencyVariance: Math.round(laborEfficiencyVariance * 100) / 100,
        totalLaborVariance: Math.round(totalLaborVariance * 100) / 100,
        vohSpendingVariance: Math.round(vohSpendingVariance * 100) / 100,
        vohEfficiencyVariance: Math.round(vohEfficiencyVariance * 100) / 100,
        fohBudgetVariance: Math.round(fohBudgetVariance * 100) / 100,
        fohVolumeVariance: Math.round(fohVolumeVariance * 100) / 100,
        totalVOHVariance: Math.round(totalVOHVariance * 100) / 100,
        totalFOHVariance: Math.round(totalFOHVariance * 100) / 100,
        totalVariance: Math.round(totalVariance * 100) / 100,
        isFavorable,
      }

      return { success: true, variance }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to calculate variances"
      }
    }
  }

  /**
   * Journalize material variances at time of purchase or usage
   */
  static async recordMaterialVariance(
    workOrderId: string,
    standardPrice: number,
    actualPrice: number,
    actualQuantity: number,
    standardQuantity: number,
    actualQuantityUsed: number,
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const priceVar = actualQuantity * (actualPrice - standardPrice)
      const usageVar = standardPrice * (actualQuantityUsed - standardQuantity)
      const absPriceVar = Math.abs(priceVar)
      const absUsageVar = Math.abs(usageVar)

      const entryId = `MV-${workOrderId}-${Date.now()}`
      const entries: any[] = []

      // Record raw materials at standard
      entries.push({
        account_id: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
        account_name: getAccountName(ACCOUNT_CODES.RAW_MATERIALS_FABRIC),
        debit: actualQuantity * standardPrice,
        credit: 0,
        description: `Materials at standard: ${actualQuantity} × EGP ${standardPrice}`,
      })

      // Price variance
      if (Math.abs(priceVar) > 0.01) {
        entries.push({
          account_id: ACCOUNT_CODES.MATERIAL_PRICE_VARIANCE,
          account_name: "Material Price Variance",
          debit: priceVar > 0 ? absPriceVar : 0,
          credit: priceVar < 0 ? absPriceVar : 0,
          description: `${priceVar > 0 ? "Unfavorable" : "Favorable"} price variance`,
        })
      }

      // Credit AP for actual amount
      entries.push({
        account_id: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        account_name: getAccountName(ACCOUNT_CODES.ACCOUNTS_PAYABLE),
        debit: 0,
        credit: actualQuantity * actualPrice,
        description: `Materials purchased at actual: ${actualQuantity} × EGP ${actualPrice}`,
      })

      // WIP at standard
      entries.push({
        account_id: ACCOUNT_CODES.WIP_MATERIALS,
        account_name: getAccountName(ACCOUNT_CODES.WIP_MATERIALS),
        debit: standardQuantity * standardPrice,
        credit: 0,
        description: `Materials to WIP at standard: ${standardQuantity} × EGP ${standardPrice}`,
      })

      // Usage variance
      if (Math.abs(usageVar) > 0.01) {
        entries.push({
          account_id: ACCOUNT_CODES.MATERIAL_USAGE_VARIANCE,
          account_name: "Material Usage Variance",
          debit: usageVar > 0 ? absUsageVar : 0,
          credit: usageVar < 0 ? absUsageVar : 0,
          description: `${usageVar > 0 ? "Unfavorable" : "Favorable"} usage variance`,
        })
      }

      // Credit raw materials at actual quantity used
      entries.push({
        account_id: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
        account_name: getAccountName(ACCOUNT_CODES.RAW_MATERIALS_FABRIC),
        debit: 0,
        credit: actualQuantityUsed * standardPrice,
        description: `Materials consumed: ${actualQuantityUsed} units`,
      })

      const totalDebits = entries.reduce((s, e) => s + (e.debit || 0), 0)
      const totalCredits = entries.reduce((s, e) => s + (e.credit || 0), 0)

      const journalEntry = {
        id: entryId,
        date: new Date(),
        type: "MATERIAL_ISSUE_TO_WIP",
        reference_doc: workOrderId,
        description: `Material issue with variance capture for WO ${workOrderId}`,
        entries,
        account_ids: [...new Set(entries.map((e: any) => e.account_id))],
        total_debits: totalDebits,
        total_credits: totalCredits,
        created_at: new Date(),
        created_by: userId,
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)
      await CentralizedAccountingService.syncMultipleAccountBalances(journalEntry.account_ids)
      return { success: true, entryId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to record material variance"
      }
    }
  }

  /**
   * Close variance accounts to COGS at period-end (standard practice when immaterial)
   */
  static async closeVarianceAccounts(
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; totalClosed?: number; error?: string }> {
    try {
      const varianceAccounts = [
        ACCOUNT_CODES.MATERIAL_PRICE_VARIANCE,
        ACCOUNT_CODES.MATERIAL_USAGE_VARIANCE,
        ACCOUNT_CODES.LABOR_RATE_VARIANCE,
        ACCOUNT_CODES.LABOR_EFFICIENCY_VARIANCE,
        ACCOUNT_CODES.OH_SPENDING_VARIANCE,
        ACCOUNT_CODES.OH_EFFICIENCY_VARIANCE,
        ACCOUNT_CODES.OH_VOLUME_VARIANCE,
      ]
      const entryId = `VAR-CLOSE-${Date.now()}`
      const entries: any[] = []
      let totalToClose = 0

      for (const code of varianceAccounts) {
        const snapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
          .where("account_ids", "array-contains", code)
          .get()

        let netBalance = 0
        for (const doc of snapshot.docs) {
          for (const line of doc.data().entries || []) {
            if (line.account_id === code) {
              netBalance += (line.debit || 0) - (line.credit || 0)
            }
          }
        }

        if (Math.abs(netBalance) > 0.01) {
          entries.push({
            account_id: code,
              account_name: getAccountName(code),
            debit: netBalance < 0 ? Math.abs(netBalance) : 0,
            credit: netBalance > 0 ? netBalance : 0,
            description: `Close variance account to COGS`,
          })
          totalToClose += netBalance
        }
      }

      if (entries.length === 0) {
        return { success: true, totalClosed: 0 }
      }

      // Offset to COGS
      entries.push({
        account_id: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
        account_name: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
        debit: totalToClose > 0 ? totalToClose : 0,
        credit: totalToClose < 0 ? Math.abs(totalToClose) : 0,
        description: `Period-end variance close-out`,
      })

      const totalDebits = entries.reduce((s, e) => s + (e.debit || 0), 0)
      const totalCredits = entries.reduce((s, e) => s + (e.credit || 0), 0)

      const journalEntry = {
        id: entryId,
        date: new Date(),
        type: "CLOSING_ENTRY",
        reference_doc: "VARIANCE-CLOSEOUT",
        description: `Period-end variance accounts closed to COGS`,
        entries,
        account_ids: [...new Set(entries.map((e: any) => e.account_id))],
        total_debits: totalDebits,
        total_credits: totalCredits,
        created_at: new Date(),
        created_by: userId,
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)
      const syncedAccounts = [...varianceAccounts, ACCOUNT_CODES.COST_OF_GOODS_SOLD]
      await CentralizedAccountingService.syncMultipleAccountBalances(syncedAccounts)
      console.log(`✅ Closed variance accounts: net EGP ${totalToClose}`)
      return { success: true, entryId, totalClosed: totalToClose }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close variance accounts"
      }
    }
  }
}
