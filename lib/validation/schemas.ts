import { z } from "zod"

// ========================================
// Common Validation Schemas
// ========================================

export const paginationSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

export const idSchema = z.object({
    id: z.string().min(1, "ID is required"),
})

// ========================================
// Customer Schemas
// ========================================

export const customerSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    email: z.string().email("Invalid email format"),
    phone: z.string().max(50).optional().default(""),
    address: z.string().max(500).optional().default(""),
})

export const customerUpdateSchema = customerSchema.partial()

// ========================================
// Inventory Schemas
// ========================================

export const inventoryItemSchema = z.object({
    sku: z.string().min(1, "SKU is required").max(100),
    name: z.string().min(1, "Name is required").max(255),
    type: z.enum(["raw", "finished"], { required_error: "Type must be 'raw' or 'finished'" }),
    unit: z.string().max(50).optional().default("pcs"),
    quantity_on_hand: z.number().min(0).default(0),
    cost_per_unit: z.number().min(0).default(0),
    reorder_level: z.number().min(0).optional().default(10),
    supplier: z.string().max(255).optional(),
    location: z.string().max(255).optional(),
    description: z.string().max(1000).optional(),
})

export const inventoryMovementSchema = z.object({
    item_id: z.string().min(1, "Item ID is required"),
    qty: z.number().int().positive("Quantity must be positive"),
    type: z.enum(["issue", "receipt", "return", "adjustment"]),
    related_doc: z.string().optional(),
    notes: z.string().max(500).optional(),
})

// ========================================
// Design Schemas
// ========================================

export const designSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().max(2000).optional(),
    category: z.string().min(1, "Category is required").max(100),
    subcategory: z.string().max(100).optional(),
    baseCost: z.number().min(0).default(0),
    materialCost: z.number().min(0).default(0),
    laborCost: z.number().min(0).default(0),
    overheadCost: z.number().min(0).default(0),
    suggestedRetailPrice: z.number().min(0).default(0),
    wholesalePrice: z.number().min(0).optional(),
    manufacturingTime: z.number().min(0).default(1),
    complexity: z.enum(["low", "medium", "high"]).default("medium"),
    status: z.enum(["active", "inactive", "discontinued"]).default("active"),
})

export const designUpdateSchema = designSchema.partial()

// ========================================
// Sales Order Schemas
// ========================================

export const salesOrderItemSchema = z.object({
    sku: z.string().min(1, "SKU is required"),
    qty: z.number().int().positive("Quantity must be positive"),
    unit_price: z.number().min(0, "Unit price must be non-negative"),
    size: z.string().optional(),
    color: z.string().optional(),
})

export const salesOrderSchema = z.object({
    customer_id: z.string().min(1, "Customer ID is required"),
    items: z.array(salesOrderItemSchema).min(1, "At least one item is required"),
    notes: z.string().max(1000).optional(),
    shipping_address: z.string().max(500).optional(),
})

// ========================================
// Work Order Schemas
// ========================================

export const workOrderSchema = z.object({
    sales_order_id: z.string().min(1, "Sales Order ID is required"),
    design_id: z.string().optional(),
    items: z.array(z.any()).optional(),
    assigned_worker: z.string().max(255).optional(),
    notes: z.string().max(1000).optional(),
})

export const workOrderUpdateSchema = z.object({
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
    completionPercentage: z.number().min(0).max(100).optional(),
    labor_hours: z.number().min(0).optional(),
    assigned_worker: z.string().max(255).optional(),
    notes: z.string().max(1000).optional(),
})

export const materialIssueSchema = z.object({
    inventoryItemId: z.string().min(1, "Inventory Item ID is required"),
    quantityIssued: z.number().positive("Quantity must be positive"),
})

// ========================================
// Invoice Schemas
// ========================================

export const invoiceSchema = z.object({
    sales_order_id: z.string().min(1, "Sales Order ID is required"),
    due_date: z.coerce.date().optional(),
    notes: z.string().max(1000).optional(),
})

// ========================================
// Payment Schemas
// ========================================

export const paymentSchema = z.object({
    invoice_id: z.string().min(1, "Invoice ID is required"),
    amount: z.number().positive("Amount must be positive"),
    method: z.enum(["cash", "card", "bank_transfer", "mobile_payment", "check"]),
    notes: z.string().max(500).optional(),
})

// ========================================
// Webhook Schemas
// ========================================

export const orderStatusWebhookSchema = z.object({
    orderId: z.string().min(1, "Order ID is required"),
    status: z.string().min(1, "Status is required"),
    webhookId: z.string().optional(),
    order: z.object({
        id: z.string().optional(),
        userId: z.string().nullable().optional(),
        status: z.string().optional(),
        items: z.array(z.object({
            productId: z.string().nullable().optional(),
            name: z.string().optional().default('Unknown Item'),
            sku: z.string().optional().default(''),
            quantity: z.number().int().positive().optional().default(1),
            basePrice: z.number().optional().default(0),
            adjustedPrice: z.number().optional().default(0),
            image: z.string().nullable().optional(),
            size: z.string().nullable().optional(),
            color: z.string().nullable().optional(),
        })).optional().default([]),
        shippingAddress: z.object({
            fullName: z.string().optional().default(''),
            address: z.string().optional().default(''),
            city: z.string().optional().default(''),
            state: z.string().optional().default(''),
            zipCode: z.string().optional().default(''),
            phone: z.string().optional().default(''),
        }).nullable().optional(),
        subtotal: z.number().optional().default(0),
        total: z.number().optional().default(0),
        shipping: z.number().optional().default(0),
        tax: z.number().optional().default(0),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
        notes: z.string().nullable().optional(),
    }).optional(),
})

// ========================================
// BOM (Bill of Materials) Schemas
// ========================================

export const bomItemSchema = z.object({
    material_id: z.string().min(1, "Material ID is required"),
    quantity: z.number().positive("Quantity must be positive"),
    unit: z.string().max(50).default("pcs"),
    waste_factor: z.number().min(0).max(1).default(0), // 0-100% waste
    notes: z.string().max(500).optional(),
})

export const bomSchema = z.object({
    design_id: z.string().min(1, "Design ID is required"),
    name: z.string().min(1, "Name is required").max(255),
    version: z.string().max(50).default("1.0"),
    items: z.array(bomItemSchema).min(1, "At least one material is required"),
    labor_hours: z.number().min(0).default(0),
    notes: z.string().max(1000).optional(),
    status: z.enum(["draft", "active", "archived"]).default("draft"),
})

// ========================================
// Vendor/Supplier Schemas
// ========================================

export const vendorSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    contact_name: z.string().max(255).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
    payment_terms: z.string().max(100).optional(), // e.g., "Net 30"
    lead_time_days: z.number().int().min(0).optional(),
    notes: z.string().max(1000).optional(),
    status: z.enum(["active", "inactive"]).default("active"),
})

// ========================================
// Purchase Order Schemas
// ========================================

export const purchaseOrderItemSchema = z.object({
    material_id: z.string().min(1, "Material ID is required"),
    quantity: z.number().positive("Quantity must be positive"),
    unit_cost: z.number().min(0, "Unit cost must be non-negative"),
})

export const purchaseOrderSchema = z.object({
    vendor_id: z.string().min(1, "Vendor ID is required"),
    items: z.array(purchaseOrderItemSchema).min(1, "At least one item is required"),
    expected_delivery: z.coerce.date().optional(),
    shipping_address: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
})

// ========================================
// Utility Types
// ========================================

export type PaginationParams = z.infer<typeof paginationSchema>
export type Customer = z.infer<typeof customerSchema>
export type InventoryItem = z.infer<typeof inventoryItemSchema>
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>
export type Design = z.infer<typeof designSchema>
export type SalesOrder = z.infer<typeof salesOrderSchema>
export type WorkOrder = z.infer<typeof workOrderSchema>
export type Invoice = z.infer<typeof invoiceSchema>
export type Payment = z.infer<typeof paymentSchema>
export type BOM = z.infer<typeof bomSchema>
export type Vendor = z.infer<typeof vendorSchema>
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>
