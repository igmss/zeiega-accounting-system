import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

export interface StandardCost {
  designId: string
  designName: string
  standardDMQuantity: number
  standardDMPrice: number
  standardDMCost: number
  standardDLHours: number
  standardDLRate: number
  standardDLCost: number
  standardVOHRate: number
  standardVOHCost: number
  budgetedFOH: number
  budgetedActivity: number
  standardFOHRate: number
  updatedAt: string
  updatedBy?: string | null
}

export interface JobVariance {
  workOrderId: string
  designId?: string
  quantity: number
  materialPriceVariance: number
  materialUsageVariance: number
  totalMaterialVariance: number
  laborRateVariance: number
  laborEfficiencyVariance: number
  totalLaborVariance: number
  vohSpendingVariance: number
  vohEfficiencyVariance: number
  fohBudgetVariance: number
  fohVolumeVariance: number
  totalVOHVariance: number
  totalFOHVariance: number
  totalVariance: number
  isFavorable: boolean
}

export class VarianceService {
  private static readonly STANDARD_COST_TABLE = TABLES.STANDARD_COSTS

  static async setStandardCost(
    designId: string,
    designName: string,
    standard: Omit<StandardCost, "designId" | "designName" | "updatedAt">,
    userId: string | null = null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = new Date().toISOString()
      const standardCost: StandardCost = {
        designId,
        designName,
        ...standard,
        updatedAt: now,
        updatedBy: userId,
      }
      const { error } = await getServiceSupabase().from(this.STANDARD_COST_TABLE).upsert(
        { id: designId, ...standardCost },
        { onConflict: "id" }
      )
      if (error) throw error
      console.log(`✅ Standard costs set for design ${designName} (${designId})`)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set standard costs"
      }
    }
  }

  static async getStandardCost(designId: string): Promise<StandardCost | null> {
    try {
      const { data, error } = await getServiceSupabase().from(this.STANDARD_COST_TABLE).select("*").eq("id", designId).single()
      return (!error && data) ? (data as StandardCost) : null
    } catch {
      return null
    }
  }

  static async calculateJobVariance(
    workOrderId: string,
    standard: StandardCost
  ): Promise<{ success: boolean; variance?: JobVariance; error?: string }> {
    try {
      const { data: wo, error } = await getServiceSupabase().from(TABLES.WORK_ORDERS).select("*").eq("id", workOrderId).single()
      if (error || !wo) {
        return { success: false, error: "Work order not found" }
      }

      const quantity = 1
      const sq = standard

      const materialsIssued = wo.materials_issued || []
      const rawMaterials = wo.raw_materials_used || []
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

      const materialPriceVariance = totalAPxAQ - totalAQTimesSP
      const materialUsageVariance = totalAQTimesSP - totalSQTimesSP

      const actualHours = wo.labor_hours || 0
      const actualLaborCost = wo.labor_cost || 0
      const actualRate = actualHours > 0 ? actualLaborCost / actualHours : 0
      const standardHours = sq.standardDLHours * quantity

      const laborRateVariance = actualHours * (actualRate - sq.standardDLRate)
      const laborEfficiencyVariance = sq.standardDLRate * (actualHours - standardHours)

      const actualVOH = wo.overhead_cost || 0
      const actualFOH = 0
      const budgetedFOHPerJob = sq.standardFOHRate * standardHours

      const vohSpendingVariance = actualVOH - (sq.standardVOHRate * actualHours)
      const vohEfficiencyVariance = sq.standardVOHRate * (actualHours - standardHours)
      const fohBudgetVariance = actualFOH - sq.budgetedFOH
      const fohVolumeVariance = sq.budgetedFOH - (sq.standardFOHRate * standardHours)

      const totalMaterialVariance = materialPriceVariance + materialUsageVariance
      const totalLaborVariance = laborRateVariance + laborEfficiencyVariance
      const totalVOHVariance = vohSpendingVariance + vohEfficiencyVariance
      const totalFOHVariance = fohBudgetVariance + fohVolumeVariance
      const totalVariance = totalMaterialVariance + totalLaborVariance + totalVOHVariance + totalFOHVariance

      const isFavorable = totalVariance < 0

      const variance: JobVariance = {
        workOrderId,
        designId: wo.design_id,
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

  static async recordMaterialVariance(
    workOrderId: string,
    standardPrice: number,
    actualPrice: number,
    actualQuantity: number,
    standardQuantity: number,
    actualQuantityUsed: number,
    userId: string | null = null
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const priceVar = actualQuantity * (actualPrice - standardPrice)
      const usageVar = standardPrice * (actualQuantityUsed - standardQuantity)
      const absPriceVar = Math.abs(priceVar)
      const absUsageVar = Math.abs(usageVar)

      const entries: any[] = []

      entries.push({
        account_id: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
        account_name: getAccountName(ACCOUNT_CODES.RAW_MATERIALS_FABRIC),
        debit: actualQuantity * standardPrice,
        credit: 0,
        description: `Materials at standard: ${actualQuantity} × EGP ${standardPrice}`,
      })

      if (Math.abs(priceVar) > 0.01) {
        entries.push({
          account_id: ACCOUNT_CODES.MATERIAL_PRICE_VARIANCE,
          account_name: "Material Price Variance",
          debit: priceVar > 0 ? absPriceVar : 0,
          credit: priceVar < 0 ? absPriceVar : 0,
          description: `${priceVar > 0 ? "Unfavorable" : "Favorable"} price variance`,
        })
      }

      entries.push({
        account_id: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        account_name: getAccountName(ACCOUNT_CODES.ACCOUNTS_PAYABLE),
        debit: 0,
        credit: actualQuantity * actualPrice,
        description: `Materials purchased at actual: ${actualQuantity} × EGP ${actualPrice}`,
      })

      entries.push({
        account_id: ACCOUNT_CODES.WIP_MATERIALS,
        account_name: getAccountName(ACCOUNT_CODES.WIP_MATERIALS),
        debit: standardQuantity * standardPrice,
        credit: 0,
        description: `Materials to WIP at standard: ${standardQuantity} × EGP ${standardPrice}`,
      })

      if (Math.abs(usageVar) > 0.01) {
        entries.push({
          account_id: ACCOUNT_CODES.MATERIAL_USAGE_VARIANCE,
          account_name: "Material Usage Variance",
          debit: usageVar > 0 ? absUsageVar : 0,
          credit: usageVar < 0 ? absUsageVar : 0,
          description: `${usageVar > 0 ? "Unfavorable" : "Favorable"} usage variance`,
        })
      }

      entries.push({
        account_id: ACCOUNT_CODES.RAW_MATERIALS_FABRIC,
        account_name: getAccountName(ACCOUNT_CODES.RAW_MATERIALS_FABRIC),
        debit: 0,
        credit: actualQuantityUsed * standardPrice,
        description: `Materials consumed: ${actualQuantityUsed} units`,
      })

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.MATERIAL_ISSUE_TO_WIP,
        entries.map((e: any) => ({
          accountCode: e.account_id,
          accountName: e.account_name,
          debit: e.debit || 0,
          credit: e.credit || 0,
          description: e.description,
        })),
        workOrderId,
        `Material issue with variance capture for WO ${workOrderId}`,
        userId
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return { success: true, entryId: result.entryId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to record material variance"
      }
    }
  }

  static async closeVarianceAccounts(
    userId: string | null = null
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
      const entries: any[] = []
      let totalToClose = 0

      for (const code of varianceAccounts) {
        const { data: snap } = await getServiceSupabase().from(TABLES.JOURNAL_ENTRIES)
          .select(`id, date, type, ${TABLES.JOURNAL_ENTRY_LINES}(account_code, account_name, debit, credit, description)`)
          .contains("account_ids", [code])

        let netBalance = 0
        for (const entry of (snap || [])) {
          const lines = (entry as any).journal_entry_lines || []
          for (const line of lines) {
            if (line.account_code === code) {
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

      entries.push({
        account_id: ACCOUNT_CODES.COST_OF_GOODS_SOLD,
        account_name: getAccountName(ACCOUNT_CODES.COST_OF_GOODS_SOLD),
        debit: totalToClose > 0 ? totalToClose : 0,
        credit: totalToClose < 0 ? Math.abs(totalToClose) : 0,
        description: `Period-end variance close-out`,
      })

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.CLOSING_ENTRY,
        entries.map((e: any) => ({
          accountCode: e.account_id,
          accountName: e.account_name,
          debit: e.debit || 0,
          credit: e.credit || 0,
          description: e.description,
        })),
        "VARIANCE-CLOSEOUT",
        `Period-end variance accounts closed to COGS`,
        userId
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      console.log(`✅ Closed variance accounts: net EGP ${totalToClose}`)
      return { success: true, entryId: result.entryId, totalClosed: totalToClose }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close variance accounts"
      }
    }
  }
}
