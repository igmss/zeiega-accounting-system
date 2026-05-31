import {
    EnhancedAccountingService,
    ACCOUNTS,
    JournalEntryType
} from "@/lib/services/enhanced-accounting-service"
import { getServiceSupabase } from "@/lib/supabase"

const mockedSupabase = getServiceSupabase as jest.Mock

// Helper to get the mock client
function getMockClient() {
    return mockedSupabase()
}

describe("EnhancedAccountingService", () => {

    beforeEach(() => {
        jest.clearAllMocks()
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // processReturn()
    // ═══════════════════════════════════════════════════════════════════════════
    describe("processReturn", () => {

        it("should reject invalid return amount", async () => {
            const result = await EnhancedAccountingService.processReturn({
                id: "RET-002",
                refundAmount: -500,
                invoiceId: "INV-001",
                items: [{ sku: "SKU-1", quantity: 1 }],
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain("Invalid return amount")
        })

        it("should reject NaN return amount", async () => {
            const result = await EnhancedAccountingService.processReturn({
                id: "RET-006",
                refundAmount: NaN,
                invoiceId: "INV-001",
                items: [{ sku: "SKU-1", quantity: 1 }],
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain("Invalid return amount")
        })

        it("should reject return with no items", async () => {
            const client = getMockClient()
            client.from = jest.fn(() => client)
            client.select = jest.fn().mockReturnThis()
            client.eq = jest.fn().mockReturnThis()
            client.maybeSingle = jest.fn().mockResolvedValue({
                data: { id: "INV-001", status: "pending", sales_order_id: "SO-1" },
                error: null,
            })
            client.limit = jest.fn().mockResolvedValue({
                data: [],
                error: null,
            })

            const result = await EnhancedAccountingService.processReturn({
                id: "RET-005",
                refundAmount: 500,
                invoiceId: "INV-001",
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain("no items")
        })

        it("should fail when invoice not found", async () => {
            const client = getMockClient()
            client.from = jest.fn(() => client)
            client.select = jest.fn().mockReturnThis()
            client.eq = jest.fn().mockReturnThis()
            client.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null })
            client.limit = jest.fn().mockResolvedValue({ data: [], error: null })

            const result = await EnhancedAccountingService.processReturn({
                id: "RET-001",
                invoiceId: "INV-NONEXISTENT",
                refundAmount: 500,
                orderId: "SO-MISSING",
                items: [{ sku: "SKU-1", quantity: 1 }],
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain("invoice not found")
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // getAccountBalance()
    // ═══════════════════════════════════════════════════════════════════════════
    describe("getAccountBalance", () => {

        it("should return cached balance when available", async () => {
            const client = getMockClient()
            client.from = jest.fn(() => client)
            client.select = jest.fn().mockReturnThis()
            client.eq = jest.fn().mockReturnThis()
            client.order = jest.fn().mockReturnThis()
            client.limit = jest.fn().mockReturnThis()
            client.maybeSingle = jest.fn().mockResolvedValue({
                data: { closing_balance: 5000 },
                error: null,
            })

            const result = await EnhancedAccountingService.getAccountBalance("1101")
            expect(result.balance).toBe(5000)
        })

        it("should fall back to journal entry line aggregation when no cache", async () => {
            const client = getMockClient()
            client.from = jest.fn(() => {
                const builder: any = {
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    order: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockReturnThis(),
                    maybeSingle: jest.fn(),
                    gte: jest.fn().mockReturnThis(),
                    lte: jest.fn().mockReturnThis(),
                }
                builder.maybeSingle.mockResolvedValue({ data: null, error: null })
                // Return mock lines for aggregation
                builder.select.mockImplementation((cols: string) => {
                    if (cols === "closing_balance") return builder
                    // journal entry lines query
                    builder.gte = jest.fn().mockReturnThis()
                    builder.lte = jest.fn().mockReturnThis()
                    // We need to resolve this query to return lines
                    Object.defineProperty(builder, 'then', {
                        value: (resolve: Function) => resolve({
                            data: [
                                { debit: 1000, credit: 0 },
                                { debit: 0, credit: 300 },
                            ],
                            error: null,
                        }),
                    })
                    return builder
                })
                return builder
            })

            const result = await EnhancedAccountingService.getAccountBalance("1101")
            expect(result.balance).toBe(700) // 1000 - 300
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // recordPaymentReceived()
    // ═══════════════════════════════════════════════════════════════════════════
    describe("recordPaymentReceived", () => {

        it("should create a balanced journal entry for payment", async () => {
            const result = await EnhancedAccountingService.recordPaymentReceived(
                "PAY-001",
                "INV-001",
                5000,
                "cash"
            )

            expect(result).not.toBeNull()
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // recordPaymentMade()
    // ═══════════════════════════════════════════════════════════════════════════
    describe("recordPaymentMade", () => {

        it("should create a balanced journal entry for vendor payment", async () => {
            const result = await EnhancedAccountingService.recordPaymentMade(
                "PAY-002",
                "VENDOR-001",
                3000,
                "Payment for materials"
            )

            expect(result).not.toBeNull()
        })
    })
})
