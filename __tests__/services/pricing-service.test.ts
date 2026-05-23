import { PricingService } from "@/lib/services/pricing-service"

describe("PricingService", () => {
    describe("costPlusPricing", () => {
        it("should calculate cost-plus prices correctly", () => {
            // DM 2100 + DL 1800 + OH 1500 = total 5400
            const result = PricingService.costPlusPricing(2100, 1800, 1500)
            expect(result.totalCost).toBe(5400)
            expect(result.suggestedPrice15).toBe(6210)  // 5400 * 1.15
            expect(result.suggestedPrice25).toBe(6750)  // 5400 * 1.25
            expect(result.suggestedPrice35).toBe(7290)  // 5400 * 1.35
        })

        it("should include SG&A allocation", () => {
            const result = PricingService.costPlusPricing(1000, 500, 300, 200)
            expect(result.totalCost).toBe(2000)
            expect(result.suggestedPrice15).toBe(2300)
        })

        it("should handle zero costs", () => {
            const result = PricingService.costPlusPricing(0, 0, 0)
            expect(result.totalCost).toBe(0)
            expect(result.suggestedPrice15).toBe(0)
        })
    })

    describe("contributionMarginAnalysis", () => {
        it("should calculate CM and break-even", () => {
            // Price EGP 55, VC EGP 38, FC EGP 200000, expected 10000 units
            const result = PricingService.contributionMarginAnalysis(55, 38, 200000, 10000)
            expect(result.contributionMargin).toBe(170000) // 17 × 10000
            expect(result.contributionMarginRatio).toBeCloseTo(30.91, 1) // 17/55
            expect(result.breakEvenUnits).toBe(11765) // ⌈200000/17⌉
            expect(result.breakEvenRevenue).toBe(647058.82) // 200000/0.3091
        })

        it("should handle zero revenue edge case", () => {
            const result = PricingService.contributionMarginAnalysis(0, 10, 10000, 100)
            expect(result.contributionMargin).toBe(-1000)
            expect(result.contributionMarginRatio).toBe(0)
        })
    })

    describe("specialOrderDecision", () => {
        it("should accept when idle capacity exists and price > VC", () => {
            // 500 units @ EGP 42, VC EGP 38, idle capacity 600
            const result = PricingService.specialOrderDecision(500, 42, 38, 600)
            expect(result.accept).toBe(true)
            expect(result.contributionPerUnit).toBe(4)
            expect(result.incrementalProfit).toBe(2000) // 500 × 4
            expect(result.idleCapacity).toBe(true)
        })

        it("should reject when price < VC", () => {
            const result = PricingService.specialOrderDecision(500, 35, 38, 600)
            expect(result.accept).toBe(false)
            expect(result.contributionPerUnit).toBe(-3)
        })

        it("should consider opportunity cost when capacity constrained", () => {
            // 800 units @ EGP 42, VC EGP 38, idle 600, regular CM EGP 17
            // Must displace 200 regular units → opportunity cost 200 × 17 = 3400
            const result = PricingService.specialOrderDecision(800, 42, 38, 600, 55, 17)
            expect(result.idleCapacity).toBe(false)
            expect(result.opportunityCost).toBe(3400)
            // Revenue: 800 × 42 = 33600, Cost: 800 × 38 + 3400 = 33800, Profit: -200
            expect(result.incrementalProfit).toBeLessThan(0)
            expect(result.accept).toBe(false)
        })
    })

    describe("makeVsBuy", () => {
        it("should recommend make when cheaper", () => {
            const result = PricingService.makeVsBuy(10, 5, 3, 2, 25)
            expect(result.decision).toBe("make")
            expect(result.makeCost).toBe(20)
            expect(result.buyCost).toBe(25)
        })

        it("should recommend buy when cheaper", () => {
            const result = PricingService.makeVsBuy(10, 8, 5, 3, 20)
            expect(result.decision).toBe("buy")
            expect(result.makeCost).toBe(26)
            expect(result.buyCost).toBe(20)
        })

        it("should include incremental handling cost for buy", () => {
            const result = PricingService.makeVsBuy(15, 10, 5, 2, 28, 3)
            expect(result.makeCost).toBe(32)
            expect(result.buyCost).toBe(31) // 28 + 3
            expect(result.decision).toBe("buy")
        })
    })

    describe("minimumAcceptablePrice", () => {
        it("should return variable cost when no opportunity cost", () => {
            expect(PricingService.minimumAcceptablePrice(38)).toBe(38)
        })

        it("should add opportunity cost per unit", () => {
            expect(PricingService.minimumAcceptablePrice(38, 5)).toBe(43)
        })
    })

    describe("throughputPerConstraint", () => {
        it("should calculate throughput per constraint hour", () => {
            // Price EGP 100, DM EGP 40, 2 hours on bottleneck
            const result = PricingService.throughputPerConstraint(100, 40, 2)
            expect(result.throughput).toBe(60)
            expect(result.throughputPerHour).toBe(30)
        })
    })
})
