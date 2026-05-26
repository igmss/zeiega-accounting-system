import {
    EnhancedAccountingService,
    ACCOUNTS,
    JournalEntryType
} from "@/lib/services/enhanced-accounting-service"

// ── Firebase mock ────────────────────────────────────────────────────────────
const createDoc = (coll: string, docId: string) => ({
    set: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    get path() { return `${coll}/${docId}` },
    get id() { return docId },
})

const createCollection = (coll: string) => {
    const col: any = {
        doc: jest.fn((docId: string) => createDoc(coll, docId)),
        where: jest.fn(),
        add: jest.fn(),
        limit: jest.fn(),
        get: jest.fn(),
        _collectionName: coll,
    }
    col.where.mockReturnValue(col)
    col.limit.mockReturnValue(col)
    return col
}

jest.mock("../../lib/firebase", () => {
    const db: any = {
        collection: jest.fn((name: string) => createCollection(name)),
        runTransaction: jest.fn(),
        batch: jest.fn(() => ({
            set: jest.fn(),
            commit: jest.fn(),
        })),
    }
    return {
        db,
        COLLECTIONS: {
            CUSTOMERS: "acc_customers",
            CHART_OF_ACCOUNTS: "acc_chart_of_accounts",
            JOURNAL_ENTRIES: "acc_journal_entries",
            SALES_ORDERS: "acc_sales_orders",
            WORK_ORDERS: "acc_work_orders",
            INVENTORY_ITEMS: "acc_inventory_items",
            INVENTORY_MOVEMENTS: "acc_inventory_movements",
            INVOICES: "acc_invoices",
            PAYMENTS: "acc_payments",
            FISCAL_PERIODS: "acc_fiscal_periods",
            ACCOUNT_BALANCES: "acc_account_balances",
            ASSETS: "acc_assets",
            DESIGNS: "acc_designs",
            VENDORS: "acc_vendors",
            PURCHASE_ORDERS: "acc_purchase_orders",
            FISCAL_YEARS: "acc_fiscal_years",
            MANUAL_ORDERS: "acc_manual_orders",
            ORDERS: "orders",
            RETURNS: "returns",
            PRODUCTS: "products",
            USERS: "users",
            INVENTORY_LAYERS: "acc_inventory_layers",
            SCRAP_RECORDS: "acc_scrap_records",
            REWORK_ORDERS: "acc_rework_orders",
            CHANGE_ORDERS: "acc_change_orders",
            RETENTION_SCHEDULES: "acc_retention_schedules",
            BUDGET_LINES: "acc_budget_lines",
        },
        FieldValue: { increment: (n: number) => n },
    }
})

const { db, COLLECTIONS } = jest.requireMock("../../lib/firebase")
const mockedDb = db as jest.Mocked<typeof db>

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a standard tx.get that handles common doc reads and queries.
 * 
 * @param overrides  Per-collection overrides for specific doc paths
 * @param fiscalClosed  If true, fiscal period queries return closed status
 */
function makeTxGet(
    overrides?: {
        invoiceExists?: boolean
        invoiceStatus?: string
        inventoryItems?: Record<string, { unit_cost: number; quantity_on_hand?: number }>
        payments?: Array<{ payment_method: string }>
    },
    fiscalClosed: boolean = false
) {
    return async (queryOrRef: any) => {
        const path: string = queryOrRef?.path ?? ""
        const collName: string = queryOrRef?._collectionName ?? ""
        const isQuery = typeof queryOrRef?.where === "function"

        // ── Doc reads (path-based) ──────────────────────────────────────
        if (path.startsWith("acc_invoices/")) {
            if (overrides?.invoiceExists ?? true) {
                return {
                    exists: true,
                    id: path.split("/").pop()!,
                    data: () => ({
                        status: overrides?.invoiceStatus ?? "unpaid",
                        sales_order_id: "SO-R1",
                    }),
                }
            }
            return { exists: false, data: () => null }
        }

        if (path.startsWith("acc_inventory_items/")) {
            const sku = path.split("/").pop()!
            const item = overrides?.inventoryItems?.[sku]
            if (item) {
                return {
                    exists: true,
                    data: () => ({
                        unit_cost: item.unit_cost,
                        quantity_on_hand: item.quantity_on_hand ?? 10,
                    }),
                }
            }
            return { exists: false, data: () => null }
        }

        if (path.startsWith("acc_account_balances/")) {
            return { exists: false, data: () => null }
        }

        // ── Queries (collection-based) ──────────────────────────────────
        if (isQuery) {
            // Fiscal period check
            if (collName === COLLECTIONS.FISCAL_PERIODS) {
                if (fiscalClosed) {
                    return {
                        empty: false,
                        docs: [
                            {
                                id: "PERIOD-CLOSED",
                                data: () => ({
                                    startDate: new Date(Date.now() - 30 * 86400000),
                                    endDate: new Date(Date.now() + 30 * 86400000),
                                    status: "closed",
                                }),
                            },
                        ],
                    }
                }
                return {
                    empty: false,
                    docs: [
                        {
                            id: "PERIOD-OPEN",
                            data: () => ({
                                startDate: new Date(Date.now() - 30 * 86400000),
                                endDate: new Date(Date.now() + 30 * 86400000),
                                status: "open",
                            }),
                        },
                    ],
                }
            }

            // Invoice fallback lookup (where + limit)
            if (collName === COLLECTIONS.INVOICES) {
                if (overrides?.invoiceExists ?? true) {
                    return {
                        empty: false,
                        docs: [
                            {
                                id: "INV-FALLBACK-001",
                                data: () => ({
                                    status: overrides?.invoiceStatus ?? "unpaid",
                                    sales_order_id: "SO-FB",
                                }),
                            },
                        ],
                    }
                }
                return { empty: true, docs: [] }
            }

            // Payments lookup for paid invoices
            if (collName === COLLECTIONS.PAYMENTS) {
                if (overrides?.payments && overrides.payments.length > 0) {
                    return {
                        empty: false,
                        docs: overrides.payments.map((pmt, i) => ({
                            data: () => pmt,
                        })),
                    }
                }
                return { empty: true, docs: [] }
            }

            // Default: empty query
            return { empty: true, docs: [] }
        }

        // Unknown doc
        return { exists: false, data: () => null }
    }
}

/**
 * Set up a transaction mock that uses the given txGet handler.
 * Returns the tx object so tests can inspect set/update calls if needed.
 */
function mockTransaction(txGetImpl: (queryOrRef: any) => Promise<any>) {
    let capturedTx: any = null
    mockedDb.runTransaction.mockImplementation(async (fn: Function) => {
        const tx: Record<string, any> = {
            set: jest.fn(),
            update: jest.fn(),
            get: jest.fn(txGetImpl),
        }
        capturedTx = tx
        try {
            return await fn(tx)
        } catch (e) {
            throw e
        }
    })
    return {
        getTx: () => capturedTx,
    }
}

describe("EnhancedAccountingService", () => {

    beforeEach(() => {
        jest.clearAllMocks()
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // recordSale()
    // ═══════════════════════════════════════════════════════════════════════════
    describe("recordSale", () => {

        it("should throw error when WIP→FG transfer fails", async () => {
            // To make WIP→FG fail: set fiscal period to "closed" so createJournalEntry
            // returns { success: false } for the WIP transfer journal entry.
            // The WIP transfer is only attempted when workOrderId is set AND costOfGoodsSold > 0.
            mockTransaction(makeTxGet({}, true /* fiscalClosed */))

            const result = await EnhancedAccountingService.recordSale(
                "INV-001",
                5000,     // salesAmount
                2000,     // costOfGoodsSold (positive → WIP transfer triggered)
                0,        // vatAmount
                "WO-001"  // workOrderId (present → WIP transfer triggered)
            )

            expect(mockedDb.runTransaction).toHaveBeenCalled()
            expect(result.success).toBe(false)
            expect(result.error).toContain("WIP→FG transfer failed")
        })

        it("should create revenue and COGS entries on success", async () => {
            mockTransaction(makeTxGet({}))

            const result = await EnhancedAccountingService.recordSale(
                "INV-002",
                10000,
                4000,
                0,
                "WO-002"
            )

            expect(mockedDb.runTransaction).toHaveBeenCalled()
            expect(result.success).toBe(true)
            expect(result.revenueEntryId).toBeDefined()
            expect(result.cogsEntryId).toBeDefined()
        })

        it("should skip WIP transfer when no workOrderId provided", async () => {
            mockTransaction(makeTxGet({}))

            const result = await EnhancedAccountingService.recordSale(
                "INV-003",
                8000,
                3000,
                0
            )

            expect(mockedDb.runTransaction).toHaveBeenCalled()
            expect(result.success).toBe(true)
            expect(result.wipTransferEntryId).toBeUndefined()
            expect(result.revenueEntryId).toBeDefined()
            expect(result.cogsEntryId).toBeDefined()
        })

        it("should include VAT in AR when vatAmount > 0", async () => {
            mockTransaction(makeTxGet({}))

            const result = await EnhancedAccountingService.recordSale(
                "INV-004",
                5000,
                2000,
                700,
                "WO-004"
            )

            expect(mockedDb.runTransaction).toHaveBeenCalled()
            expect(result.success).toBe(true)
            expect(result.revenueEntryId).toBeDefined()
            expect(result.cogsEntryId).toBeDefined()
        })

        it("should propagate transaction error", async () => {
            mockedDb.runTransaction.mockImplementation(async () => {
                throw new Error("Firestore transaction failed")
            })

            const result = await EnhancedAccountingService.recordSale(
                "INV-005",
                5000,
                2000
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain("Firestore transaction failed")
        })
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // processReturn()
    // ═══════════════════════════════════════════════════════════════════════════
    describe("processReturn", () => {

        it("should throw error when invoice not found", async () => {
            // invoiceExists=false: no invoice doc, no invoice query match
            mockTransaction(makeTxGet({ invoiceExists: false }))

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

        it("should throw error on invalid return amount", async () => {
            const result = await EnhancedAccountingService.processReturn({
                id: "RET-002",
                refundAmount: -500,
                invoiceId: "INV-001",
                items: [{ sku: "SKU-1", quantity: 1 }],
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain("Invalid return amount")
            expect(mockedDb.runTransaction).not.toHaveBeenCalled()
        })

        it("should use AR credit account for unpaid invoice returns", async () => {
            mockTransaction(makeTxGet({
                invoiceExists: true,
                invoiceStatus: "unpaid",
                inventoryItems: { "SKU-1": { unit_cost: 50 } },
            }))

            const result = await EnhancedAccountingService.processReturn({
                id: "RET-003",
                refundAmount: 500,
                invoiceId: "INV-UNPAID",
                items: [{ sku: "SKU-1", quantity: 1 }],
            })

            expect(result.success).toBe(true)
            expect(result.creditMemoId).toBeDefined()
            expect(mockedDb.runTransaction).toHaveBeenCalled()
        })

        it("should validate zero refund amount", async () => {
            mockTransaction(makeTxGet({
                invoiceExists: true,
                inventoryItems: { "SKU-1": { unit_cost: 50 } },
            }))

            const result = await EnhancedAccountingService.processReturn({
                id: "RET-004",
                refundAmount: 0,
                invoiceId: "INV-001",
                items: [{ sku: "SKU-1", quantity: 1 }],
            })

            expect(mockedDb.runTransaction).toHaveBeenCalled()
            expect(result.success).toBe(true)
        })

        it("should handle returns with missing items array", async () => {
            mockTransaction(makeTxGet({
                invoiceExists: true,
                invoiceStatus: "unpaid",
            }))

            const result = await EnhancedAccountingService.processReturn({
                id: "RET-005",
                refundAmount: 500,
                invoiceId: "INV-001",
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain("no items")
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
    })
})
