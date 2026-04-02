import {
    paginationSchema,
    customerSchema,
    inventoryItemSchema,
    designSchema,
    workOrderSchema,
    paymentSchema,
    bomSchema,
    vendorSchema,
    purchaseOrderSchema,
} from "@/lib/validation/schemas"

describe("Validation Schemas", () => {
    describe("paginationSchema", () => {
        it("should accept valid pagination params", () => {
            const result = paginationSchema.safeParse({ page: "1", limit: "20" })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.page).toBe(1)
                expect(result.data.limit).toBe(20)
            }
        })

        it("should use defaults when not provided", () => {
            const result = paginationSchema.safeParse({})
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.page).toBe(1)
                expect(result.data.limit).toBe(20)
            }
        })

        it("should reject invalid limit", () => {
            const result = paginationSchema.safeParse({ page: "1", limit: "999" })
            expect(result.success).toBe(false)
        })
    })

    describe("customerSchema", () => {
        it("should accept valid customer data", () => {
            const result = customerSchema.safeParse({
                name: "Test Customer",
                email: "test@example.com",
                phone: "123456789",
                address: "123 Main St",
            })
            expect(result.success).toBe(true)
        })

        it("should reject invalid email", () => {
            const result = customerSchema.safeParse({
                name: "Test Customer",
                email: "invalid-email",
            })
            expect(result.success).toBe(false)
        })

        it("should require name", () => {
            const result = customerSchema.safeParse({
                email: "test@example.com",
            })
            expect(result.success).toBe(false)
        })
    })

    describe("inventoryItemSchema", () => {
        it("should accept valid inventory item", () => {
            const result = inventoryItemSchema.safeParse({
                sku: "SKU-001",
                name: "Test Item",
                type: "raw",
                unit: "pcs",
                quantity_on_hand: 100,
                cost_per_unit: 10.50,
            })
            expect(result.success).toBe(true)
        })

        it("should reject invalid type", () => {
            const result = inventoryItemSchema.safeParse({
                sku: "SKU-001",
                name: "Test Item",
                type: "invalid",
            })
            expect(result.success).toBe(false)
        })
    })

    describe("designSchema", () => {
        it("should accept valid design data", () => {
            const result = designSchema.safeParse({
                name: "Summer Dress",
                description: "A beautiful summer dress",
                category: "Dresses",
                baseCost: 100,
                materialCost: 50,
                laborCost: 30,
                complexity: "medium",
            })
            expect(result.success).toBe(true)
        })

        it("should validate complexity enum", () => {
            const result = designSchema.safeParse({
                name: "Test",
                category: "Test",
                complexity: "super-hard",
            })
            expect(result.success).toBe(false)
        })
    })

    describe("paymentSchema", () => {
        it("should accept valid payment", () => {
            const result = paymentSchema.safeParse({
                invoice_id: "INV-001",
                amount: 100.50,
                method: "card",
            })
            expect(result.success).toBe(true)
        })

        it("should reject negative amount", () => {
            const result = paymentSchema.safeParse({
                invoice_id: "INV-001",
                amount: -50,
                method: "cash",
            })
            expect(result.success).toBe(false)
        })

        it("should validate payment method", () => {
            const result = paymentSchema.safeParse({
                invoice_id: "INV-001",
                amount: 100,
                method: "bitcoin",
            })
            expect(result.success).toBe(false)
        })
    })

    describe("bomSchema", () => {
        it("should accept valid BOM", () => {
            const result = bomSchema.safeParse({
                design_id: "DSN-001",
                name: "Summer Dress BOM",
                version: "1.0",
                items: [
                    {
                        material_id: "MAT-001",
                        quantity: 2,
                        unit: "meters",
                        waste_factor: 0.05,
                    },
                ],
                labor_hours: 4,
                status: "draft",
            })
            expect(result.success).toBe(true)
        })

        it("should require at least one item", () => {
            const result = bomSchema.safeParse({
                design_id: "DSN-001",
                name: "Empty BOM",
                items: [],
            })
            expect(result.success).toBe(false)
        })
    })

    describe("vendorSchema", () => {
        it("should accept valid vendor", () => {
            const result = vendorSchema.safeParse({
                name: "Fabric Supplier Inc.",
                contact_name: "John Doe",
                email: "john@supplier.com",
                phone: "+1234567890",
                payment_terms: "Net 30",
                lead_time_days: 14,
                status: "active",
            })
            expect(result.success).toBe(true)
        })

        it("should require vendor name", () => {
            const result = vendorSchema.safeParse({
                email: "test@test.com",
            })
            expect(result.success).toBe(false)
        })
    })

    describe("purchaseOrderSchema", () => {
        it("should accept valid purchase order", () => {
            const result = purchaseOrderSchema.safeParse({
                vendor_id: "VND-001",
                items: [
                    {
                        material_id: "MAT-001",
                        quantity: 100,
                        unit_cost: 5.50,
                    },
                ],
                expected_delivery: new Date(),
            })
            expect(result.success).toBe(true)
        })

        it("should require vendor_id", () => {
            const result = purchaseOrderSchema.safeParse({
                items: [{ material_id: "MAT-001", quantity: 100, unit_cost: 5 }],
            })
            expect(result.success).toBe(false)
        })
    })
})
