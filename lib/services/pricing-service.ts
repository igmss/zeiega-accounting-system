import { supabase, TABLES, getServiceSupabase } from "../supabase"

export interface PricingAnalysis {
  totalCost: number
  suggestedPrice15: number
  suggestedPrice25: number
  suggestedPrice35: number
  contributionMargin: number
  contributionMarginRatio: number
  breakEvenUnits: number
  breakEvenRevenue: number
}

export interface SpecialOrderDecision {
  accept: boolean
  reason: string
  incrementalRevenue: number
  incrementalCost: number
  incrementalProfit: number
  opportunityCost: number
  pricePerUnit: number
  variableCostPerUnit: number
  contributionPerUnit: number
  idleCapacity: boolean
}

export interface MakeBuyDecision {
  decision: "make" | "buy"
  makeCost: number
  buyCost: number
  costDifference: number
  reasoning: string
}

export class PricingService {

  static costPlusPricing(
    directMaterials: number,
    directLabor: number,
    manufacturingOverhead: number,
    sgAndAAllocation: number = 0
  ): PricingAnalysis {
    const totalCost = directMaterials + directLabor + manufacturingOverhead + sgAndAAllocation
    const suggestedPrice15 = Math.round(totalCost * 1.15 * 100) / 100
    const suggestedPrice25 = Math.round(totalCost * 1.25 * 100) / 100
    const suggestedPrice35 = Math.round(totalCost * 1.35 * 100) / 100

    return {
      totalCost,
      suggestedPrice15,
      suggestedPrice25,
      suggestedPrice35,
      contributionMargin: 0,
      contributionMarginRatio: 0,
      breakEvenUnits: 0,
      breakEvenRevenue: 0,
    }
  }

  static contributionMarginAnalysis(
    sellingPricePerUnit: number,
    variableCostPerUnit: number,
    totalFixedCosts: number,
    expectedUnits: number
  ): PricingAnalysis {
    const contributionPerUnit = sellingPricePerUnit - variableCostPerUnit
    const totalCM = contributionPerUnit * expectedUnits
    const cmRatio = sellingPricePerUnit > 0
      ? contributionPerUnit / sellingPricePerUnit
      : 0

    const breakEvenUnits = contributionPerUnit > 0
      ? Math.ceil(totalFixedCosts / contributionPerUnit)
      : Infinity

    const breakEvenRevenue = cmRatio > 0
      ? Math.round((totalFixedCosts / cmRatio) * 100) / 100
      : Infinity

    const totalCost = (variableCostPerUnit * expectedUnits) + totalFixedCosts
    const totalRevenue = sellingPricePerUnit * expectedUnits

    return {
      totalCost: totalCost / expectedUnits,
      suggestedPrice15: 0,
      suggestedPrice25: 0,
      suggestedPrice35: 0,
      contributionMargin: totalCM,
      contributionMarginRatio: Math.round(cmRatio * 10000) / 100,
      breakEvenUnits,
      breakEvenRevenue,
    }
  }

  static specialOrderDecision(
    orderUnits: number,
    offeredPricePerUnit: number,
    variableCostPerUnit: number,
    idleCapacity: number,
    regularPricePerUnit: number = 0,
    regularCMPerUnit: number = 0
  ): SpecialOrderDecision {
    const contributionPerUnit = offeredPricePerUnit - variableCostPerUnit

    if (orderUnits <= idleCapacity) {
      const incrementalRevenue = orderUnits * offeredPricePerUnit
      const incrementalCost = orderUnits * variableCostPerUnit
      const incrementalProfit = incrementalRevenue - incrementalCost

      return {
        accept: contributionPerUnit > 0,
        reason: contributionPerUnit > 0
          ? `Accept: price (EGP ${offeredPricePerUnit}) covers variable cost (EGP ${variableCostPerUnit}) and contributes EGP ${contributionPerUnit}/unit. Idle capacity available (${idleCapacity} units).`
          : `Reject: price (EGP ${offeredPricePerUnit}) does not cover variable cost (EGP ${variableCostPerUnit}).`,
        incrementalRevenue,
        incrementalCost,
        incrementalProfit: Math.round(incrementalProfit * 100) / 100,
        opportunityCost: 0,
        pricePerUnit: offeredPricePerUnit,
        variableCostPerUnit,
        contributionPerUnit,
        idleCapacity: true,
      }
    }

    const displacedUnits = orderUnits - idleCapacity
    const opportunityCost = displacedUnits * regularCMPerUnit
    const incrementalRevenue = orderUnits * offeredPricePerUnit
    const incrementalCost = (orderUnits * variableCostPerUnit) + opportunityCost
    const incrementalProfit = incrementalRevenue - incrementalCost

    return {
      accept: incrementalProfit > 0,
      reason: incrementalProfit > 0
        ? `Accept: special order generates EGP ${incrementalProfit} incremental profit after accounting for EGP ${opportunityCost} in lost regular sales.`
        : `Reject: after accounting for EGP ${opportunityCost} in lost regular sales, net loss of EGP ${Math.abs(Math.round(incrementalProfit * 100) / 100)}.`,
      incrementalRevenue,
      incrementalCost: Math.round(incrementalCost * 100) / 100,
      incrementalProfit: Math.round(incrementalProfit * 100) / 100,
      opportunityCost,
      pricePerUnit: offeredPricePerUnit,
      variableCostPerUnit,
      contributionPerUnit,
      idleCapacity: false,
    }
  }

  static makeVsBuy(
    makeDM: number,
    makeDL: number,
    makeVOH: number,
    makeAvoidableFOH: number,
    buyPrice: number,
    buyIncrementalHandling: number = 0
  ): MakeBuyDecision {
    const makeCost = makeDM + makeDL + makeVOH + makeAvoidableFOH
    const buyCost = buyPrice + buyIncrementalHandling
    const difference = makeCost - buyCost

    if (Math.abs(difference) < 0.01) {
      return {
        decision: "make",
        makeCost,
        buyCost,
        costDifference: 0,
        reasoning: "Costs are equivalent. Defaulting to make to maintain quality control.",
      }
    }

    return {
      decision: difference < 0 ? "make" : "buy",
      makeCost,
      buyCost,
      costDifference: Math.abs(Math.round(difference * 100) / 100),
      reasoning: difference < 0
        ? `Make: EGP ${Math.abs(difference)} cheaper per unit. Total make: EGP ${makeCost} vs. buy: EGP ${buyCost}.`
        : `Buy: EGP ${difference} cheaper per unit to outsource. Total make: EGP ${makeCost} vs. buy: EGP ${buyCost}. Consider quality, lead time, and supplier reliability.`,
    }
  }

  static minimumAcceptablePrice(
    variableCostPerUnit: number,
    opportunityCostPerUnit: number = 0
  ): number {
    return Math.round((variableCostPerUnit + opportunityCostPerUnit) * 100) / 100
  }

  static throughputPerConstraint(
    pricePerUnit: number,
    directMaterialCostPerUnit: number,
    hoursOnConstraint: number
  ): { throughput: number; throughputPerHour: number } {
    const throughput = pricePerUnit - directMaterialCostPerUnit
    const throughputPerHour = hoursOnConstraint > 0
      ? Math.round((throughput / hoursOnConstraint) * 100) / 100
      : 0

    return { throughput, throughputPerHour }
  }

  static async getJobProfitability(workOrderId: string): Promise<{
    revenue: number
    materials: number
    labor: number
    overhead: number
    totalCost: number
    grossProfit: number
    grossMarginPercent: number
    contributionMargin: number
    cmRatio: number
  }> {
    try {
      const { data: wo, error } = await getServiceSupabase().from(TABLES.WORK_ORDERS).select("*").eq("id", workOrderId).single()
      if (error || !wo) throw new Error("Work order not found")

      const revenue = wo.total_amount || 0
      const labor = wo.labor_cost || 0
      const overhead = wo.overhead_cost || 0

      const materialsIssued = wo.materials_issued || []
      const rawMaterials = wo.raw_materials_used || []
      const allMats = materialsIssued.length > 0 ? materialsIssued : rawMaterials
      const materials = allMats.reduce(
        (sum: number, m: any) => sum + (m.totalCost || (m.qty * (m.unitCost || m.cost || 0)) || 0),
        0
      )

      const totalCost = materials + labor + overhead
      const grossProfit = revenue - totalCost
      const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0
      const contributionMargin = revenue - materials
      const cmRatio = revenue > 0 ? (contributionMargin / revenue) * 100 : 0

      return {
        revenue,
        materials,
        labor,
        overhead,
        totalCost,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
        contributionMargin: Math.round(contributionMargin * 100) / 100,
        cmRatio: Math.round(cmRatio * 100) / 100,
      }
    } catch (error) {
      console.error("Error calculating job profitability:", error)
      throw new Error("Failed to calculate job profitability")
    }
  }
}
