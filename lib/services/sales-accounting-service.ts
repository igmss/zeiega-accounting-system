import { db, COLLECTIONS, FieldValue } from "../firebase"
import type { Customer, SalesOrder, WorkOrder, WebsiteOrder } from "../types"
import { ACCOUNTS, EnhancedAccountingService } from "./enhanced-accounting-service"
import { JournalEntryType, JournalEntryService, JournalLine } from "./journal-entry-service"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"

interface ReturnItem {
    sku?: string
    productId?: string
    id?: string
    quantity?: number
    qty?: number
}

interface ReturnData {
    id?: string
    returnId?: string
    orderId?: string
    invoiceId?: string
    refundAmount?: number
    amount?: number
    items?: ReturnItem[]
    paymentMethod?: string
    payment_method?: string
}

export class SalesAccountingService {
    static async syncWebsiteOrders() {
        const processed: string[] = []
        const errors: string[] = []

        try {
            const ordersSnapshot = await db.collection(COLLECTIONS.ORDERS).where("processed", "!=", true).limit(50).get()

            for (const orderDoc of ordersSnapshot.docs) {
                const order = orderDoc.data() as any
                try {
                    await this.createSalesOrder(order)

                    await orderDoc.ref.update({
                        processed: true,
                        processed_at: new Date(),
                        processing_error: null,
                    })

                    processed.push(order.id)
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error"
                    console.error(`❌ Error sync process for order ${orderDoc.id}:`, errorMessage)
                    errors.push(`Order ${orderDoc.id}: ${errorMessage}`)

                    try {
                        await orderDoc.ref.update({
                            processed: false,
                            processing_error: errorMessage,
                            last_processed_at: new Date(),
                        })
                    } catch {
                        console.error(`❌ Could not update error state for order ${orderDoc.id}`)
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching orders:", error)
            errors.push(`Fetch error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }

        return { processed, errors }
    }

    static async syncWebsiteReturns() {
        const processed: string[] = []
        const errors: string[] = []

        try {
            const returnsSnapshot = await db.collection(COLLECTIONS.RETURNS).where("processed", "!=", true).limit(50).get()

            for (const returnDoc of returnsSnapshot.docs) {
                try {
                    const returnData = returnDoc.data() as any
                    const result = await this.processReturn(returnData)

                    if (!result?.success) {
                        errors.push(`Return ${returnDoc.id}: ${result?.error || "Unknown error"}`)
                        continue
                    }

                    await returnDoc.ref.update({
                        processed: true,
                        processed_at: new Date(),
                    })

                    processed.push(returnData.id)
                } catch (error) {
                    console.error(`Error processing return ${returnDoc.id}:`, error)
                    errors.push(`Return ${returnDoc.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
                }
            }
        } catch (error) {
            console.error("Error fetching returns:", error)
            errors.push(`Fetch error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }

        return { processed, errors }
    }

    public static async processReturn(
        returnData: ReturnData
    ): Promise<{ success: boolean; creditMemoId?: string; error?: string }> {
        const creditMemoId = `CM-${Date.now()}`
        const returnId = returnData?.id ?? returnData?.returnId ?? "unknown"
        const returnAmount = Number(returnData.refundAmount ?? returnData.amount ?? 0)

        if (!Number.isFinite(returnAmount) || returnAmount < 0) {
            return { success: false, error: `Invalid return amount for return ${returnId}` }
        }

        return db.runTransaction(async (tx) => {
            const orderId = returnData?.orderId
            const invoiceIdFromReturn = returnData?.invoiceId

            let invoiceData: Record<string, unknown> | null = null
            let invoiceDocId: string | null = null

            if (invoiceIdFromReturn && typeof invoiceIdFromReturn === "string") {
                const doc = await tx.get(db.collection(COLLECTIONS.INVOICES).doc(invoiceIdFromReturn))
                if (doc.exists) {
                    invoiceData = doc.data() as Record<string, unknown>
                    invoiceDocId = doc.id
                }
            }
            
            if (!invoiceData && orderId && typeof orderId === "string") {
                const snapshot = await tx.get(
                    db.collection(COLLECTIONS.INVOICES).where("sales_order_id", "==", orderId).limit(1)
                )
                if (!snapshot.empty) {
                    const first = snapshot.docs[0]
                    invoiceData = first.data() as Record<string, unknown>
                    invoiceDocId = first.id
                }
                if (!invoiceData) {
                    const derivedId = `INV-${orderId.slice(-8)}`
                    const doc = await tx.get(db.collection(COLLECTIONS.INVOICES).doc(derivedId))
                    if (doc.exists) {
                        invoiceData = doc.data() as Record<string, unknown>
                        invoiceDocId = doc.id
                    }
                }
            }

            if (!invoiceData || !invoiceDocId) {
                throw new Error(`Original invoice not found for return ${returnId}`)
            }

            const rawStatus = invoiceData.status
            const invoiceStatus: string | undefined = typeof rawStatus === 'string' ? rawStatus : undefined

            let creditAccountCode: string = ACCOUNTS.ACCOUNTS_RECEIVABLE
            let creditAccountName = getAccountName(ACCOUNTS.ACCOUNTS_RECEIVABLE)

            if (invoiceStatus === "paid") {
                const paymentsSnapshot = await tx.get(
                    db.collection(COLLECTIONS.PAYMENTS)
                        .where("invoice_id", "==", invoiceDocId)
                        .limit(1)
                )
                const paymentDoc = paymentsSnapshot.docs[0]
                const paymentData = paymentDoc?.data?.() as any

                const paymentMethod =
                    returnData?.paymentMethod ??
                    returnData?.payment_method ??
                    paymentData?.payment_method ??
                    paymentData?.method ??
                    paymentData?.paymentMethod

                if (!paymentMethod || typeof paymentMethod !== "string") {
                    throw new Error(`Unable to determine original payment method for paid invoice ${invoiceDocId}`)
                }

                const isCash = paymentMethod.toLowerCase() === "cash"
                creditAccountCode = isCash ? ACCOUNTS.CASH : ACCOUNTS.BANK
                creditAccountName = getAccountName(creditAccountCode)
            }

            const items = Array.isArray(returnData?.items) ? returnData.items : []
            if (items.length === 0) {
                throw new Error(`Return ${returnId} has no items to restore inventory value`)
            }

            let inventoryRestorationValue = 0
            const restorationLinesByItem: Array<{ sku: string; quantity: number }> = []

            for (const item of items) {
                const sku: string | undefined = item?.sku ?? item?.productId ?? item?.id
                const quantityRaw = item?.quantity ?? item?.qty
                const quantity = Number(quantityRaw ?? 0)

                if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
                    throw new Error(`Invalid return item (sku=${String(sku)}, qty=${String(quantityRaw)})`)
                }

                const invDoc = await tx.get(db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(sku))
                if (!invDoc.exists) {
                    throw new Error(`Inventory item not found: ${sku}`)
                }

                const invData = invDoc.data() as any
                const unitCostRaw = invData?.unit_cost ?? invData?.cost_per_unit ?? invData?.unitCost ?? 0
                const unitCost = Number(unitCostRaw ?? 0)

                if (!Number.isFinite(unitCost) || unitCost < 0) {
                    throw new Error(`Invalid unit cost for inventory restoration (sku=${sku})`)
                }

                inventoryRestorationValue += unitCost * quantity
                restorationLinesByItem.push({ sku, quantity })
            }

            if (inventoryRestorationValue < 0) {
                throw new Error(`Unable to compute inventory restoration value for return ${returnId}`)
            }

            const salesReturnLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.SALES_RETURNS,
                    accountName: getAccountName(ACCOUNTS.SALES_RETURNS),
                    debit: returnAmount,
                    credit: 0,
                    description: `Return ${returnId}`,
                },
                {
                    accountCode: creditAccountCode,
                    accountName: creditAccountName,
                    debit: 0,
                    credit: returnAmount,
                    description: `Refund for return ${returnId}`,
                },
            ]

            const memoResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.SALES_RETURN,
                salesReturnLines,
                creditMemoId,
                `Credit memo / return ${returnId}`,
                "system",
                undefined,
                tx
            )

            if (!memoResult.success) {
                throw new Error(memoResult.error || "Failed to create credit memo")
            }

            const inventoryLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.INVENTORY_FINISHED_GOODS,
                    accountName: getAccountName(ACCOUNTS.INVENTORY_FINISHED_GOODS),
                    debit: inventoryRestorationValue,
                    credit: 0,
                    description: `Inventory restoration for return ${returnId}`,
                },
                {
                    accountCode: ACCOUNTS.COGS,
                    accountName: getAccountName(ACCOUNTS.COGS),
                    debit: 0,
                    credit: inventoryRestorationValue,
                    description: `COGS reversal for return ${returnId}`,
                },
            ]

            const inventoryResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.INVENTORY_ADJUSTMENT,
                inventoryLines,
                creditMemoId,
                `Inventory restoration journal for return ${returnId}`,
                "system",
                undefined,
                tx
            )

            if (!inventoryResult.success) {
                throw new Error(inventoryResult.error || "Failed to create inventory restoration journal entry")
            }

            for (const item of restorationLinesByItem) {
                const invRef = db.collection(COLLECTIONS.INVENTORY_ITEMS).doc(item.sku)
                tx.update(invRef, {
                    quantity_on_hand: FieldValue.increment(item.quantity),
                    updated_at: new Date(),
                })
            }

            return { success: true, creditMemoId }
        }).catch(error => ({
            success: false,
            creditMemoId,
            error: error instanceof Error ? error.message : "Transaction failed during return processing"
        }))
    }

    static async createSalesOrder(websiteOrder: WebsiteOrder) {
        const now = Date.now()
        const salesOrderId = websiteOrder.id

        const existingSO = await db.collection(COLLECTIONS.SALES_ORDERS).doc(salesOrderId).get()
        if (existingSO.exists) {
            console.log(`ℹ️ Sales order ${salesOrderId} already exists, skipping`)
            return
        }

        let customerEmail = websiteOrder.customer_email
        if (!customerEmail && websiteOrder.userId) {
            console.log(`🔍 Looking up email for user ${websiteOrder.userId}...`)
            const userDoc = await db.collection(COLLECTIONS.USERS).doc(websiteOrder.userId).get()
            if (userDoc.exists) {
                customerEmail = userDoc.data()?.email
            }
        }

        const customerId = await this.findOrCreateCustomer(customerEmail || websiteOrder.userId || "unknown")

        const salesOrder: SalesOrder = {
            id: salesOrderId,
            website_order_id: websiteOrder.id,
            customer_id: customerId,
            items: websiteOrder.items.map((item) => ({
                sku: item.sku || item.id,
                qty: item.quantity || 1,
                unit_price: item.price || 0,
            })),
            status: "pending",
            created_at: new Date(),
        }

        const workOrderId = `WO-${now}-${Math.random().toString(36).substr(2, 4)}`
        const workOrder: WorkOrder = {
            id: workOrderId,
            sales_order_id: salesOrderId,
            raw_materials_used: [],
            labor_hours: 0,
            labor_cost: 0,
            overhead_cost: 0,
            total_cost: 0,
            estimated_cost: 0,
            status: "pending",
            created_at: new Date(),
        }

        const batch = db.batch()
        batch.set(db.collection(COLLECTIONS.SALES_ORDERS).doc(salesOrderId), salesOrder)
        batch.set(db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId), workOrder)
        
        await batch.commit()
        console.log(`✅ Atomic: Created sales order ${salesOrderId} and work order ${workOrderId}`)
    }

    static async findOrCreateCustomer(email: string): Promise<string> {
        const customerSnapshot = await db.collection(COLLECTIONS.CUSTOMERS).where("email", "==", email).limit(1).get()

        if (!customerSnapshot.empty) {
            return customerSnapshot.docs[0].id
        }

        const usersRef = db.collection(COLLECTIONS.USERS)
        const userSnapshot = await usersRef.where("email", "==", email).limit(1).get()

        let name = email.split("@")[0]
        if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data()
            name = userData.name || userData.displayName || name
        }

        const customerId = `CUST-${Date.now()}`
        const customer: Customer = {
            id: customerId,
            name,
            email,
            phone: "",
            address: "",
            created_at: new Date(),
        }

        await db.collection(COLLECTIONS.CUSTOMERS).doc(customerId).set(customer)
        return customerId
    }

    static async recordSale(
        invoiceId: string,
        salesAmount: number,
        costOfGoodsSold: number,
        vatAmount: number = 0,
        workOrderId?: string
    ): Promise<{
        success: boolean
        revenueEntryId?: string
        cogsEntryId?: string
        wipTransferEntryId?: string
        error?: string
    }> {
        return db.runTransaction(async (tx) => {
            let wipTransferEntryId: string | undefined
            if (workOrderId && costOfGoodsSold > 0) {
                // Here we call EnhancedAccountingService for Manufacturing logic to prevent circular deps
                // Alternatively, we can import ManufacturingAccountingService
                // I will use EnhancedAccountingService for now as a facade
                const wipTransfer = await EnhancedAccountingService.recordWIPToFinishedGoods(workOrderId, costOfGoodsSold, tx)
                if (!wipTransfer.success) {
                    throw new Error(`WIP→FG transfer failed: ${wipTransfer.error}`)
                }
                wipTransferEntryId = wipTransfer.entryId
            }

            const totalReceivable = salesAmount + vatAmount
            
            const revenueLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.ACCOUNTS_RECEIVABLE,
                    accountName: "Accounts Receivable",
                    debit: totalReceivable,
                    credit: 0,
                    description: `Invoice: ${invoiceId} (Total: ${totalReceivable})`,
                },
                {
                    accountCode: ACCOUNTS.SALES_REVENUE,
                    accountName: "Sales Revenue",
                    debit: 0,
                    credit: salesAmount,
                    description: `Sale net revenue`,
                },
            ]
            
            if (vatAmount > 0) {
                revenueLines.push({
                    accountCode: ACCOUNTS.VAT_PAYABLE,
                    accountName: "VAT Payable",
                    debit: 0,
                    credit: vatAmount,
                    description: "Sales VAT (14%)",
                })
            }

            const revenueResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.SALES_INVOICE,
                revenueLines,
                invoiceId,
                undefined,
                "system",
                undefined,
                tx
            )

            if (!revenueResult.success) {
                throw new Error(revenueResult.error || "Revenue JE creation failed")
            }

            const cogsLines: JournalLine[] = [
                {
                    accountCode: ACCOUNTS.COGS,
                    accountName: getAccountName(ACCOUNTS.COGS),
                    debit: costOfGoodsSold,
                    credit: 0,
                    description: `COGS for invoice: ${invoiceId}`,
                },
                {
                    accountCode: ACCOUNTS.INVENTORY_FINISHED_GOODS,
                    accountName: getAccountName(ACCOUNTS.INVENTORY_FINISHED_GOODS),
                    debit: 0,
                    credit: costOfGoodsSold,
                    description: `Goods sold`,
                },
            ]

            const cogsResult = await JournalEntryService.createJournalEntry(
                JournalEntryType.SALES_COGS,
                cogsLines,
                invoiceId,
                undefined,
                "system",
                undefined,
                tx
            )

            if (!cogsResult.success) {
                throw new Error(cogsResult.error || "COGS JE creation failed")
            }

            return {
                success: true,
                revenueEntryId: revenueResult.entryId,
                cogsEntryId: cogsResult.entryId,
                wipTransferEntryId,
            }
        }).catch(error => ({
            success: false,
            error: error instanceof Error ? error.message : "Transaction failed during sale recording"
        }))
    }

    static async processOverdueInvoices(): Promise<{ processed: number; errors: number }> {
        try {
            const now = new Date()
            const snapshot = await db.collection(COLLECTIONS.INVOICES)
                .where("status", "in", ["unpaid", "partial"])
                .get()

            const batch = db.batch()
            let count = 0
            
            snapshot.forEach(doc => {
                const invoice = doc.data()
                let dueDate: Date | null = null
                if (invoice.due_date?.toDate) {
                    dueDate = invoice.due_date.toDate()
                } else if (invoice.due_date) {
                    dueDate = new Date(invoice.due_date)
                }
                
                if (dueDate && dueDate < now) {
                    batch.update(doc.ref, { 
                        status: "overdue",
                        updated_at: now
                    })
                    count++
                }
            })

            if (count > 0) {
                await batch.commit()
            }
            
            console.log(`✅ Processed ${count} overdue invoices`)
            return { processed: count, errors: 0 }
        } catch (error) {
            console.error("Error processing overdue invoices:", error)
            return { processed: 0, errors: 1 }
        }
    }
}
