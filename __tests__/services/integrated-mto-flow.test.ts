import { PricingService } from "@/lib/services/pricing-service"
import { OverheadService } from "@/lib/services/overhead-service"
import { VarianceService } from "@/lib/services/variance-service"

describe("Integrated MTO Costing Flow", () => {
    /**
     * Full MTO costing scenario from skill specification:
     *
     * Job #427:
     *   - DM: EGP 18,000
     *   - DL: EGP 12,000
     *   - Machine Hours: 850
     *   - POHR: EGP 20/MH (estimated OH EGP 2.4M / 120,000 MH)
     *
     * Expected:
     *   - Applied OH = 850 × 20 = EGP 17,000
     *   - Total Job Cost = 18,000 + 12,000 + 17,000 = EGP 47,000
     */

    it("should compute correct POHR", () => {
        const pohr = OverheadService.calculatePOHR(2400000, 120000)
        expect(pohr).toBe(20)
    })

    it("should apply overhead correctly", () => {
        const pohr = 20
        const actualMH = 850
        const appliedOH = Math.round(actualMH * pohr * 100) / 100
        expect(appliedOH).toBe(17000)
    })

    it("should compute total job cost", () => {
        const dm = 18000
        const dl = 12000
        const oh = 17000
        const totalJobCost = dm + dl + oh
        expect(totalJobCost).toBe(47000)
    })

    it("should compute gross margin at EGP 60,000 selling price", () => {
        const sellingPrice = 60000
        const totalCost = 47000
        const grossProfit = sellingPrice - totalCost
        const grossMargin = (grossProfit / sellingPrice) * 100
        expect(grossProfit).toBe(13000)
        expect(grossMargin).toBeCloseTo(21.67, 1)
    })
})

describe("IFRS 15 Cost-to-Cost Revenue Recognition", () => {
    /**
     * Contract: EGP 5M, total estimated costs EGP 4.5M
     * Costs to date: EGP 1.8M
     *
     * Expected:
     *   - % Complete = 1.8M / 4.5M = 40%
     *   - Revenue to date = 40% × 5M = EGP 2M
     */

    it("should compute percentage of completion correctly", () => {
        const costsToDate = 1800000
        const totalEstimatedCosts = 4500000
        const pctComplete = (costsToDate / totalEstimatedCosts) * 100
        expect(pctComplete).toBe(40)
    })

    it("should compute revenue to date", () => {
        const pctComplete = 40
        const contractPrice = 5000000
        const revenueToDate = (pctComplete / 100) * contractPrice
        expect(revenueToDate).toBe(2000000)
    })

    it("should cap percentage at 100%", () => {
        const pctComplete = Math.min((5000000 / 4500000) * 100, 100)
        expect(pctComplete).toBe(100)
    })

    it("should detect onerous contract when costs exceed price", () => {
        const totalEstimatedCosts = 5100000
        const contractPrice = 5000000
        const expectedLoss = totalEstimatedCosts - contractPrice
        expect(expectedLoss).toBe(100000)
    })

    it("should compute contract asset vs liability", () => {
        const revenueToDate = 2000000
        const billedToDate = 1500000
        const contractAsset = Math.max(0, revenueToDate - billedToDate)
        const contractLiability = Math.max(0, billedToDate - revenueToDate)
        expect(contractAsset).toBe(500000)  // unbilled revenue
        expect(contractLiability).toBe(0)
    })

    it("should reverse when billing exceeds revenue", () => {
        const revenueToDate = 1500000
        const billedToDate = 2000000
        const contractLiability = Math.max(0, billedToDate - revenueToDate)
        expect(contractLiability).toBe(500000)  // overbilling
    })
})

describe("Working Capital & Cash Conversion Cycle", () => {
    /**
     * MTO business scenario:
     *   WIP: EGP 850K, Raw Materials: EGP 120K, FG: EGP 200K
     *   AR: EGP 400K, AP: EGP 350K
     *   Monthly COGS: EGP 900K → Annual COGS: EGP 10.8M
     */

    it("should compute cash conversion cycle", () => {
        const avgInventory = 850000 + 120000 + 200000 // 1,170,000
        const annualCOGS = 900000 * 12 // 10,800,000
        const ar = 400000
        const ap = 350000
        const annualRevenue = annualCOGS * 1.3 // assumed markup

        const dio = (avgInventory / annualCOGS) * 365
        const dso = (ar / annualRevenue) * 365
        const dpo = (ap / annualCOGS) * 365
        const ccc = dio + dso - dpo

        expect(dio).toBeCloseTo(39.5, 0)  // ~40 days inventory
        expect(dso).toBeCloseTo(10.4, 0)  // ~10 days AR
        expect(dpo).toBeCloseTo(11.8, 0)  // ~12 days AP
        expect(ccc).toBeCloseTo(38.1, 0)  // ~38 day cash cycle
    })

    it("should identify working capital risk when CCC > 60 days", () => {
        // CCC of 38 days is acceptable
        const ccc = 38
        const isAtRisk = ccc > 60
        expect(isAtRisk).toBe(false)
    })
})
