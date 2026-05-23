import {
    EnhancedAccountingService,
    ACCOUNTS,
    JournalEntryType
} from "@/lib/services/enhanced-accounting-service"
import { ACCOUNT_CODES } from "@/lib/accounting/account-types"

describe("EnhancedAccountingService", () => {
    describe("createJournalEntry", () => {
        it("should validate balanced entries (debits = credits)", async () => {
            const result = await EnhancedAccountingService.createJournalEntry(
                JournalEntryType.GENERAL,
                [
                    { accountCode: ACCOUNTS.CASH, accountName: "Cash on Hand", debit: 100, credit: 0, description: "Test" },
                    { accountCode: ACCOUNTS.SALES_REVENUE, accountName: "Sales Revenue", debit: 0, credit: 50, description: "Test" },
                ],
                "TEST-001"
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain("not balanced")
        })

        it("should reject entries with both debit and credit on same line", async () => {
            const result = await EnhancedAccountingService.createJournalEntry(
                JournalEntryType.GENERAL,
                [
                    { accountCode: ACCOUNTS.CASH, accountName: "Cash on Hand", debit: 100, credit: 100, description: "Bad" },
                ],
                "TEST-001"
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain("both debit and credit")
        })

        it("should reject negative amounts", async () => {
            const result = await EnhancedAccountingService.createJournalEntry(
                JournalEntryType.GENERAL,
                [
                    { accountCode: ACCOUNTS.CASH, accountName: "Cash on Hand", debit: -100, credit: 0, description: "Negative" },
                    { accountCode: ACCOUNTS.SALES_REVENUE, accountName: "Sales Revenue", debit: 0, credit: -100, description: "Negative" },
                ],
                "TEST-001"
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain("Negative")
        })
    })

    describe("recordMaterialIssue", () => {
        it("should reject zero or negative total cost", async () => {
            const result = await EnhancedAccountingService.recordMaterialIssue(
                "WO-001",
                []
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain("positive")
        })

        it("should calculate total cost correctly", async () => {
            const materials = [
                { itemId: "M1", itemName: "Fabric", quantity: 10, unitCost: 5 },
                { itemId: "M2", itemName: "Thread", quantity: 20, unitCost: 2 },
            ]

            const result = await EnhancedAccountingService.recordMaterialIssue("WO-001", materials)

            // 10*5 + 20*2 = 50 + 40 = 90
            expect(result.totalCost).toBe(90)
        })
    })

    describe("recordLaborApplied", () => {
        it("should calculate labor cost correctly", async () => {
            const result = await EnhancedAccountingService.recordLaborApplied(
                "WO-001",
                8, // hours
                75 // rate per hour
            )

            expect(result.totalCost).toBe(600) // 8 * 75
        })

        it("should reject zero hours", async () => {
            const result = await EnhancedAccountingService.recordLaborApplied(
                "WO-001",
                0,
                75
            )

            expect(result.success).toBe(false)
        })
    })

    describe("ACCOUNTS", () => {
        it("should have all required account codes matching the new COA", () => {
            // Assets - new codes
            expect(ACCOUNTS.CASH).toBe(ACCOUNT_CODES.CASH_ON_HAND)           // "1101"
            expect(ACCOUNTS.ACCOUNTS_RECEIVABLE).toBe(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE) // "1110"
            expect(ACCOUNTS.INVENTORY_RAW_MATERIALS).toBe(ACCOUNT_CODES.RAW_MATERIALS_FABRIC) // "1201"
            expect(ACCOUNTS.INVENTORY_WIP).toBe(ACCOUNT_CODES.INVENTORY_WIP)  // "1210"
            expect(ACCOUNTS.INVENTORY_FINISHED_GOODS).toBe(ACCOUNT_CODES.INVENTORY_FINISHED_GOODS) // "1220"

            // Liabilities
            expect(ACCOUNTS.ACCOUNTS_PAYABLE).toBe(ACCOUNT_CODES.ACCOUNTS_PAYABLE) // "2101"
            expect(ACCOUNTS.VAT_PAYABLE).toBe(ACCOUNT_CODES.VAT_PAYABLE)     // "2110"

            // Revenue
            expect(ACCOUNTS.SALES_REVENUE).toBe(ACCOUNT_CODES.SALES_RETAIL)  // "4001"

            // COGS
            expect(ACCOUNTS.COGS).toBe(ACCOUNT_CODES.COST_OF_GOODS_SOLD)     // "5301"
            expect(ACCOUNTS.DIRECT_MATERIALS).toBe(ACCOUNT_CODES.RAW_MATERIALS_USED)   // "5001"
        })

        it("should use numeric codes from the new Chart of Accounts", () => {
            expect(ACCOUNTS.CASH).toBe("1101")
            expect(ACCOUNTS.ACCOUNTS_RECEIVABLE).toBe("1110")
            expect(ACCOUNTS.INVENTORY_RAW_MATERIALS).toBe("1201")
            expect(ACCOUNTS.ACCOUNTS_PAYABLE).toBe("2101")
            expect(ACCOUNTS.SALES_REVENUE).toBe("4001")
            expect(ACCOUNTS.COGS).toBe("5301")
        })
    })
})
